# Private company document content

Handbook, guide and training source files are stored in the application's private Google Cloud Storage bucket. They are not distributed in the public source repository. `backend/src/privateLibraryManifest.json` pins the release archive and each file by SHA-256.

The backend bootstrap restores the pinned bundle before importing application routes. The Cloud Run service account needs read access to the existing application bucket (`PTONBOARDFILES` or `GCS_BUCKET_NAME`). Restoration fails closed on missing access or a checksum mismatch. This does not publish a handbook: administrators still stage and publish reviewed company editions in the document workspace.

For an authorized local checkout, configure the same private storage credentials and bucket, then run from `backend`:

```
node src/scripts/restorePrivateLibraryContent.js
```

Do not force-add ignored company content. To update the supplied source, create a new immutable archive in private storage and update its manifest only after verifying the uploaded bytes. Keep ordinary code and tests in Git. Published editions and employee activity remain in the application's database.

Some handbook files were committed before this storage change. Removing them from the current tree does not erase earlier public Git history.
