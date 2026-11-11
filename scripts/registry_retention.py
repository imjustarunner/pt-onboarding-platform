#!/usr/bin/env python3
"""Plan registry cleanup; --apply deletes reviewed old images, --sync-only pins use.

Only the two named app repositories are managed. Cloud Run routes, data, and
revisions are never changed. Credentials stay in memory and reports omit env vars.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

REPOS = ('onboarding-backend', 'onboarding-frontend')
PIN_PREFIX = 'cost-retain-'
KEEP_PREFIXES = ('production', 'latest', 'keep-', 'release-', 'rollback-', 'retain-', PIN_PREFIX)
OLD_TEST_PREFIXES = ('employee-', 'handbook-pay-', 'program-pay-', 'travel-review-', 'ticket-assignment-fix-')
MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json'


def timestamp(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))


def package_uri(image):
    return image['uri'].split('@')[0]


def manual_tag(tag):
    return (not re.fullmatch(r'[a-f0-9]{7,64}', tag)
            and not tag.startswith(KEEP_PREFIXES + OLD_TEST_PREFIXES))


def select_images(images, referenced, now, days=7, keep_count=20):
    """Fail conservatively on unknown formats/times; keep recent versions per package."""
    by_package = {}
    for image in images:
        by_package.setdefault(package_uri(image), []).append(image)
    newest = set()
    for versions in by_package.values():
        newest.update(i['uri'] for i in sorted(versions, key=lambda i: i['uploadTime'], reverse=True)[:keep_count])
    kept, deleted = [], []
    for image in images:
        reasons = list(referenced.get(image['uri'], []))
        if image['uri'] in newest:
            reasons.append('newest-versions')
        if image.get('mediaType') != MANIFEST:
            reasons.append('unrecognized-manifest-format')
        for tag in image.get('tags', []):
            # Our stale pins are rotated separately, so do not make them permanent.
            if tag.startswith(PIN_PREFIX):
                continue
            if tag.startswith(KEEP_PREFIXES) or manual_tag(tag):
                reasons.append('explicit-tag:' + tag)
        try:
            if timestamp(image['uploadTime']) >= now - dt.timedelta(days=days):
                reasons.append('recent-upload')
            if timestamp(image.get('updateTime', image['uploadTime'])) >= now - dt.timedelta(days=1):
                reasons.append('recently-updated')
        except (KeyError, ValueError):
            reasons.append('unreadable-timestamp')
        row = dict(image, keepReasons=sorted(set(reasons)))
        (kept if reasons else deleted).append(row)
    return kept, deleted


def policies():
    return {
        'delete-old-images': {'id': 'delete-old-images', 'action': 'DELETE', 'condition': {'tagState': 'ANY', 'olderThan': '604800s'}},
        'keep-protected': {'id': 'keep-protected', 'action': 'KEEP', 'condition': {'tagState': 'TAGGED', 'tagPrefixes': list(KEEP_PREFIXES)}},
        'keep-newest-20': {'id': 'keep-newest-20', 'action': 'KEEP', 'mostRecentVersions': {'keepCount': 20}},
    }


class Registry:
    def __init__(self, project, region):
        self.project, self.region = project, region
        self.token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
        cafile = os.environ.get('SSL_CERT_FILE')
        sdk_ca = Path.home() / 'google-cloud-sdk/lib/third_party/certifi/cacert.pem'
        self.ctx = ssl.create_default_context(cafile=cafile or (str(sdk_ca) if sdk_ca.exists() else None))

    def request(self, url, params=None, method='GET', body=None):
        if params:
            url += '?' + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        headers = {'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=45) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            detail = json.load(error).get('error', {}).get('message', '')
            raise RuntimeError(f'{method} {url.split("?")[0]}: HTTP {error.code}: {detail[:350]}') from None

    def rows(self, url, key, params=None):
        params, result = dict(params or {}), []
        while True:
            data = self.request(url, params)
            result.extend(data.get(key, []))
            token = data.get('nextPageToken') or data.get('metadata', {}).get('continue')
            if not token:
                return result
            params['continue' if 'metadata' in data else 'pageToken'] = token

    def parent(self, repo):
        return f'projects/{self.project}/locations/{self.region}/repositories/{repo}'

    def ar(self, path):
        return 'https://artifactregistry.googleapis.com/v1/' + path

    def inventory(self):
        result = {}
        def load(repo):
            parent = self.parent(repo)
            return {'repository': self.request(self.ar(parent)),
                    'images': self.rows(self.ar(parent + '/dockerImages'), 'dockerImages', {'pageSize': 1000})}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for repo, data in zip(REPOS, pool.map(load, REPOS)):
                result[repo] = data
        return result

    def references(self, images):
        image_map = {i['uri']: i for i in images}
        tag_map = {package_uri(i) + ':' + tag: i['uri'] for i in images for tag in i.get('tags', [])}
        references, pins, missing, routes = {}, {}, [], []

        def protect(uri, label, pin, required=False):
            if not uri:
                raise RuntimeError('Missing resolved image digest for ' + label)
            if not any(f'/{self.project}/{repo}/' in uri for repo in REPOS):
                return
            uri = tag_map.get(uri, uri)
            if uri not in image_map:
                if required:
                    raise RuntimeError('Current workload image is absent from registry: ' + label)
                missing.append({'reference': label, 'image': uri})
                return
            references.setdefault(uri, []).append(label)
            pins[(package_uri(image_map[uri]), PIN_PREFIX + pin)] = uri

        services = self.rows(f'https://run.googleapis.com/v2/projects/{self.project}/locations/-/services', 'services')
        for service in services:
            region = service['name'].split('/locations/')[1].split('/')[0]
            name = service['name'].rsplit('/', 1)[1]
            revisions = self.rows(f'https://{region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{self.project}/revisions', 'items', {'labelSelector': 'serving.knative.dev/service=' + name, 'limit': 1000})
            lookup = {r['metadata']['name']: r for r in revisions}
            for traffic in service.get('trafficStatuses', []):
                revision_name = traffic['revision']
                revision = lookup.get(revision_name)
                if revision is None:
                    revision = self.request(f'https://{region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/{self.project}/revisions/{revision_name}')
                uri = revision.get('status', {}).get('imageDigest')
                tag = traffic.get('tag')
                label = f'{name}:{tag or "production"}:{revision_name}'
                protect(uri, label, f'preview-{name}-{tag}' if tag else f'live-{name}', required=bool(traffic.get('percent')))
                routes.append({'service': name, 'revision': revision_name, 'tag': tag, 'percent': traffic.get('percent', 0), 'image': uri})
            seen, count = set(), 0
            for revision in sorted(revisions, key=lambda r: r['metadata']['creationTimestamp'], reverse=True):
                uri = revision.get('status', {}).get('imageDigest')
                ready = any(c.get('type') == 'Ready' and c.get('status') == 'True' for c in revision.get('status', {}).get('conditions', []))
                if not ready or uri not in image_map or uri in seen:
                    continue
                seen.add(uri)
                count += 1
                protect(uri, f'{name}:rollback:{revision["metadata"]["name"]}', f'rollback-{name}-{count}')
                if count == 5:
                    break
        jobs = self.rows(f'https://run.googleapis.com/v2/projects/{self.project}/locations/{self.region}/jobs', 'jobs')
        for job in jobs:
            name = job['name'].rsplit('/', 1)[1]
            for number, container in enumerate(job.get('template', {}).get('template', {}).get('containers', [])):
                protect(container.get('image'), f'job:{name}', f'job-{name}-{number}', required=True)
            executions = self.rows('https://run.googleapis.com/v2/' + job['name'] + '/executions', 'executions', {'pageSize': 1000})
            for execution in executions:
                if execution.get('completionTime'):
                    continue
                for number, container in enumerate(execution.get('template', {}).get('containers', [])):
                    protect(container.get('image'), 'execution:' + execution['name'], f'execution-{name}-{hashlib.sha256(execution["name"].encode()).hexdigest()[:12]}-{number}', required=True)
        for image in images:
            if image.get('mediaType') != MANIFEST or any(manual_tag(t) for t in image.get('tags', [])):
                protect(image['uri'], 'manual-or-unrecognized-format', 'manual-' + image['uri'].split(':')[-1][:20])
        return references, pins, missing, routes

    def version(self, uri):
        host, project, repo, tail = uri.split('/', 3)
        assert project == self.project and repo in REPOS and host == self.region + '-docker.pkg.dev'
        package, digest = tail.split('@')
        assert re.fullmatch(r'sha256:[a-f0-9]{64}', digest)
        return self.parent(repo) + '/packages/' + urllib.parse.quote(package, safe='') + '/versions/' + digest

    def sync_pins(self, images, pins):
        existing = {(package_uri(i), tag): i['uri'] for i in images for tag in i.get('tags', []) if tag.startswith(PIN_PREFIX)}
        for (package, tag), uri in pins.items():
            if existing.get((package, tag)) == uri:
                continue
            parent = self.version(uri).split('/versions/')[0]
            path = parent + '/tags/' + tag
            body = {'name': path, 'version': self.version(uri)}
            if (package, tag) in existing:
                self.request(self.ar(path), {'updateMask': 'version'}, 'PATCH', body)
            else:
                self.request(self.ar(parent + '/tags'), {'tagId': tag}, 'POST', body)
        # Remove only this tool's obsolete pins after all current references are pinned.
        for (package, tag), uri in existing.items():
            if (package, tag) not in pins:
                self.request(self.ar(self.version(uri).split('/versions/')[0] + '/tags/' + tag), method='DELETE')

    def wait(self, operation):
        deadline = time.monotonic() + 300
        while not operation.get('done'):
            if time.monotonic() > deadline:
                raise RuntimeError('Registry operation still pending: ' + operation['name'])
            time.sleep(1)
            operation = self.request(self.ar(operation['name']))
        if operation.get('error'):
            raise RuntimeError(json.dumps(operation['error']))
        return operation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--sync-only', action='store_true')
    parser.add_argument('--project', default='ptonboard-dev')
    parser.add_argument('--region', default='us-west3')
    parser.add_argument('--report-dir', type=Path, required=True)
    args = parser.parse_args()
    args.report_dir.mkdir(parents=True, exist_ok=True)
    client = Registry(args.project, args.region)
    now = dt.datetime.now(dt.timezone.utc)
    inventory = client.inventory()
    images = [i for repo in inventory.values() for i in repo['images']]
    referenced, pins, missing, routes = client.references(images)
    kept, candidates = select_images(images, referenced, now)
    report = {'capturedAt': now.isoformat(), 'mode': 'apply' if args.apply else 'sync' if args.sync_only else 'plan', 'inventoryBefore': inventory, 'protectedRoutes': routes, 'alreadyMissingPreviewImages': missing, 'retainedImages': kept, 'deleteCandidates': candidates, 'policies': policies(), 'deleted': []}
    def save():
        (args.report_dir / 'retention-result.json').write_text(json.dumps(report, indent=2) + '\n')
    save()
    print(json.dumps({'mode': report['mode'], 'images': len(images), 'kept': len(kept), 'candidates': len(candidates), 'candidateManifestGiB': sum(int(i.get('imageSizeBytes', 0)) for i in candidates) / 2**30, 'missingPreexistingPreviews': len(missing)}), flush=True)
    if not (args.apply or args.sync_only):
        return
    client.sync_pins(images, pins)
    report['protectionPinsSynced'] = len(pins)
    save()
    if args.sync_only:
        return
    for repo in REPOS:
        repo_candidates = [i for i in candidates if '/' + repo + '/' in i['uri']]
        for offset in range(0, len(repo_candidates), 40):
            # Refresh references, tags, upload/update age and package history before each deletion.
            fresh = client.inventory()
            fresh_images = [i for data in fresh.values() for i in data['images']]
            refs, fresh_pins, new_missing, current_routes = client.references(fresh_images)
            client.sync_pins(fresh_images, fresh_pins)
            _, safe = select_images(fresh_images, refs, dt.datetime.now(dt.timezone.utc))
            safe_uris = {i['uri'] for i in safe}
            batch = [i for i in repo_candidates[offset:offset+40] if i['uri'] in safe_uris]
            if not batch:
                continue
            names = [client.version(i['uri']) for i in batch]
            url = client.ar(client.parent(repo) + '/packages/-/versions:batchDelete')
            validation = client.request(url, method='POST', body={'names': names, 'validateOnly': True})
            client.wait(validation)
            deletion = client.request(url, method='POST', body={'names': names, 'validateOnly': False})
            client.wait(deletion)
            report['deleted'].extend(i['uri'] for i in batch)
            save()
            print(json.dumps({'repository': repo, 'deletedBatch': len(batch), 'deletedTotal': len(report['deleted'])}), flush=True)
    # A fresh protection sync precedes activation of the native background policies.
    after = client.inventory()
    after_images = [i for data in after.values() for i in data['images']]
    _, final_pins, final_missing, final_routes = client.references(after_images)
    client.sync_pins(after_images, final_pins)
    report['protectedRoutesAfter'] = final_routes
    for repo in REPOS:
        existing = after[repo]['repository'].get('cleanupPolicies', {})
        merged = dict(existing, **policies())
        operation = client.request(client.ar(client.parent(repo)), {'updateMask': 'cleanupPolicies,cleanupPolicyDryRun'}, 'PATCH', {'name': client.parent(repo), 'cleanupPolicies': merged, 'cleanupPolicyDryRun': False})
        client.wait(operation)
    report['inventoryAfter'] = client.inventory()
    report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    save()
    print(json.dumps({'deletedTotal': len(report['deleted']), 'remainingImages': len(after_images), 'policiesEnabled': list(REPOS)}), flush=True)


if __name__ == '__main__':
    main()
