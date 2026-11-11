import datetime as dt
import unittest

from registry_retention import MANIFEST, PIN_PREFIX, policies, select_images

NOW = dt.datetime(2026, 11, 11, tzinfo=dt.timezone.utc)


def image(number, days=30, package='app', tags=None, media=MANIFEST):
    return {'uri': f'us-west3-docker.pkg.dev/p/repo/{package}@sha256:{number:064x}',
            'uploadTime': (NOW - dt.timedelta(days=days)).isoformat(),
            'tags': tags or [], 'mediaType': media}


class RetentionSafety(unittest.TestCase):
    def test_old_production_and_preview_references_survive(self):
        rows = [image(i) for i in range(25)]
        refs = {rows[0]['uri']: ['production'], rows[1]['uri']: ['preview']}
        kept, deleted = select_images(rows, refs, NOW, keep_count=0)
        self.assertEqual({i['uri'] for i in kept}, set(refs))
        self.assertTrue(set(refs).isdisjoint(i['uri'] for i in deleted))

    def test_recent_builds_and_recent_tag_updates_are_not_deleted(self):
        rows = [image(1, days=2), image(2)]
        rows[1]['updateTime'] = (NOW - dt.timedelta(hours=1)).isoformat()
        self.assertEqual(select_images(rows, {}, NOW, keep_count=0)[1], [])

    def test_twenty_versions_are_kept_for_each_package(self):
        rows = [image(i, days=10+i, package=p) for p in ['frontend', 'auricwell'] for i in range(25)]
        kept, deleted = select_images(rows, {}, NOW)
        self.assertEqual(len(kept), 40)
        self.assertEqual(len(deleted), 10)

    def test_release_and_unknown_human_tags_survive(self):
        rows = [image(1, tags=['production']), image(2, tags=['release-1']), image(3, tags=['owner-investigation'])]
        self.assertEqual(select_images(rows, {}, NOW, keep_count=0)[1], [])

    def test_old_unused_build_and_retired_test_tags_can_be_deleted(self):
        rows = [image(1, tags=['a'*40]), image(2, tags=['handbook-pay-20261029-1142'])]
        kept, deleted = select_images(rows, {}, NOW, keep_count=0)
        self.assertEqual(kept, [])
        self.assertEqual(len(deleted), 2)

    def test_stale_tool_pins_do_not_make_images_permanent(self):
        kept, deleted = select_images([image(1, tags=[PIN_PREFIX+'rollback-app-5'])], {}, NOW, keep_count=0)
        self.assertEqual(len(deleted), 1)

    def test_unknown_manifest_format_and_bad_timestamp_fail_conservatively(self):
        rows = [image(1, media='unknown'), image(2)]
        rows[1]['uploadTime'] = 'invalid'
        self.assertEqual(select_images(rows, {}, NOW, keep_count=0)[1], [])

    def test_native_policy_keeps_pins_and_recent_package_history(self):
        rules = policies()
        self.assertEqual(rules['delete-old-images']['condition']['olderThan'], '604800s')
        self.assertIn(PIN_PREFIX, rules['keep-protected']['condition']['tagPrefixes'])
        self.assertEqual(rules['keep-newest-20']['mostRecentVersions']['keepCount'], 20)

    def test_explicit_native_digest_keep_overrides_age_and_missing_live_reference(self):
        row = image(1)
        rules = {'repo': {'archived-rollback': {'action': 'KEEP', 'condition': {
            'tagState': 'ANY', 'versionNamePrefixes': [row['uri'].split('@')[-1][:30]]}}}}
        kept, deleted = select_images([row], {}, NOW, keep_count=0, keep_policies=rules)
        self.assertEqual(deleted, [])
        self.assertIn('existing-keep-policy:archived-rollback', kept[0]['keepReasons'])

    def test_native_keep_rules_honor_tag_and_package_conditions(self):
        rows = [image(1, tags=['archive-1'], package='app'), image(2, tags=['archive-2'], package='other')]
        rules = {'repo': {'owner-archive': {'action': 'KEEP', 'condition': {
            'tagState': 'TAGGED', 'tagPrefixes': ['archive-'], 'packageNamePrefixes': ['app'], 'olderThan': '14d'}}}}
        kept, deleted = select_images(rows, {}, NOW, keep_count=0, keep_policies=rules)
        # Unknown human tags are retained even without a policy; use their reasons.
        self.assertIn('existing-keep-policy:owner-archive', kept[0]['keepReasons'])
        self.assertNotIn('existing-keep-policy:owner-archive', kept[1]['keepReasons'])

    def test_existing_larger_history_keep_is_respected(self):
        rows = [image(i, days=10+i) for i in range(30)]
        rules = {'repo': {'keep-25': {'action': 'KEEP', 'mostRecentVersions': {'keepCount': 25}}}}
        kept, deleted = select_images(rows, {}, NOW, keep_count=0, keep_policies=rules)
        self.assertEqual(len(kept), 25)
        self.assertEqual(len(deleted), 5)


if __name__ == '__main__':
    unittest.main()
