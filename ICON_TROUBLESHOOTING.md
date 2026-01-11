# Icon Display Troubleshooting

## Issue: Icons showing as broken images

### Possible Causes

1. **Files not uploaded to GCS**
   - Check if files actually exist in the `ptonboardfiles` bucket under `icons/` folder
   - Run: `gsutil ls gs://ptonboardfiles/icons/`

2. **Signed URL generation failing**
   - Check Cloud Run logs for errors when accessing `/uploads/icons/...`
   - Look for: "Error generating signed URL for file"

3. **Path format mismatch**
   - Icons are stored as: `icons/filename.ext` in GCS
   - Frontend requests: `/uploads/icons/filename.ext`
   - Backend extracts: `icons/filename.ext` and generates signed URL

4. **CORS issues**
   - Signed URLs from GCS should work, but check browser console for CORS errors

### Debugging Steps

1. **Check if files exist in GCS:**
   ```bash
   gsutil ls gs://ptonboardfiles/icons/
   ```

2. **Check Cloud Run logs:**
   ```bash
   gcloud run services logs read onboarding-backend --region us-west3 --project=ptonboard-dev --limit=50
   ```

3. **Test signed URL generation:**
   - Try accessing an icon directly: `https://onboarding-backend-378990906760.us-west3.run.app/uploads/icons/icon-1234567890-123456789.png`
   - Should redirect to a signed GCS URL

4. **Check browser console:**
   - Open browser DevTools → Network tab
   - Try loading an icon
   - Check the request/response for errors

### Fixes Applied

1. ✅ Added `storage.objectViewer` and `storage.objectAdmin` roles to Cloud Run service account
2. ✅ Improved error handling in `/uploads` route with file existence check
3. ✅ Added better logging for file requests
4. ✅ Improved error messages in `getSignedUrl` method

### Next Steps

If icons still don't display:

1. Verify files are in GCS bucket
2. Check Cloud Run logs for specific errors
3. Test signed URL generation manually
4. Consider making icons public (if appropriate) instead of using signed URLs
