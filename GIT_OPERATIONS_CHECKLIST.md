# Git Operations Checklist

## ⚠️ IMPORTANT: Always Run These Commands in Order

When you ask me to push changes, I will ALWAYS:
1. Run `git status` first to see what's changed
2. Check for untracked files that might be imported
3. Add files to staging
4. Commit with a message
5. Push to remote

## Simple Checklist (For You to Follow)

Copy and paste these commands **in order**:

### 1. Check what's changed:
```bash
git status
```

### 2. Look for untracked files (marked with `??`):
```bash
git status --short | grep "^??"
```
**If you see any `.vue`, `.js`, `.jsx` files here that are imported in your code, they need to be added!**

### 3. Add the files you want to commit:
```bash
# Add specific files (recommended)
git add path/to/file1.vue path/to/file2.js

# Or add all changes (use carefully!)
git add .
```

### 4. Verify what's staged:
```bash
git status --short
```
**Files with `A` = new files, `M` = modified files**

### 5. Commit:
```bash
git commit -m "Your descriptive commit message here"
```

### 6. Push:
```bash
git push
```

## Quick Reference Commands

### Check for Missing Imported Files
```bash
# Find all untracked frontend files
git status --short | grep "^??" | grep "frontend/src"

# Check if a specific file is tracked
git ls-files | grep <filename>
```

### Before Pushing Checklist
- [ ] Run `git status` to see all changes
- [ ] Check for untracked files (`??`) that might be imported
- [ ] Verify build works locally: `cd frontend && npm run build`
- [ ] Stage only the files you want to commit
- [ ] Review staged changes with `git status --short`
- [ ] Commit with descriptive message
- [ ] Push to remote

## Common Issues

### Issue: "Module not found" in GitHub Actions
**Cause:** File exists locally but not in git
**Solution:** 
1. Find the file: `git status | grep "??"`
2. Add it: `git add <file>`
3. Commit and push

### Issue: Case Sensitivity Errors
**Cause:** macOS is case-insensitive, Linux (CI) is case-sensitive
**Solution:** Ensure import paths match exact file names (case-sensitive)
