# Library — Internal Resource Management System

## Feature Overview

Create a new application area called **Library**.

Library should function as the organization's internal, agency-specific version of Google Drive: a centralized place where authorized users can upload, organize, search, view, download, share, and maintain agency resources.

This should **not** feel like a generic file manager. It should be designed specifically for a mental health, counseling, tutoring, coaching, and human-services organization.

The Library should support:

* Files
* Documents
* PDFs
* Word documents
* Spreadsheets
* Presentations
* Images
* Templates
* Guides
* Forms
* Assessments
* Care documents
* Safety plans
* Handouts
* External links
* Videos or web resources
* Agency procedures
* Client-facing resources
* Provider-facing resources
* Administrative resources

The goal is to create **one centralized knowledge and resource repository inside the application**.

---

# Navigation

Add a primary navigation item:

**Library**

Icon suggestion:

* Book
* Folder
* Library/bookshelf
* Archive

Clicking Library opens the main Library dashboard.

---

# Main Library Dashboard

The Library homepage should feel simple, modern, searchable, and easy to browse.

## Header

Display:

**Library**

Subtitle:

> Find guides, resources, templates, care documents, forms, and links available through your organization.

Include primary actions in the upper-right:

**+ Add Resource**

When clicked, allow:

* Upload File
* Add Link
* Create Folder
* Create Resource Collection

---

# Global Search

Prominently display a large search field:

**Search the Library**

Search should inspect:

* Resource title
* File name
* Description
* Category
* Tags
* Keywords
* Folder
* Uploaded by
* Intended audience
* Resource type

Example searches:

* safety plan
* anxiety
* parent handout
* ROI
* treatment plan
* crisis
* school
* Medicaid
* tutoring
* onboarding

Search results should return both **files and links**.

---

# Primary Library Categories

The system should support customizable categories.

Start with the following default categories:

## Guides & Resources

Examples:

* Coping skills guides
* Parent resources
* Provider guides
* Psychoeducation
* Community resource guides
* School resources
* Client education materials

---

## Templates

Examples:

* Letter templates
* Documentation templates
* Clinical templates
* Email templates
* Administrative templates
* Worksheets
* Printable templates

---

## Forms & Assessments

Examples:

* Screening tools
* Assessments
* Intake forms
* Questionnaires
* Rating scales
* Internal forms
* Checklists

---

## Care Documents

This category should contain documents directly related to supporting client care.

Examples:

* Safety plans
* Crisis plans
* Care plans
* Discharge resources
* Transition plans
* Coping plans
* Client support documents
* Wellness plans
* Family support documents
* School support documents
* Emergency resources

---

## Policies & Procedures

Examples:

* Agency procedures
* Clinical procedures
* Billing procedures
* Documentation standards
* Compliance guidance
* Administrative workflows
* Employee reference materials

---

## Community & External Resources

Examples:

* Crisis resources
* Community agencies
* Referral resources
* Government resources
* Medicaid resources
* Educational resources
* Professional organizations

These may frequently be saved as **links rather than uploaded files**.

---

# Folder System

Library should support folders and nested folders.

Example:

Library

* Care Documents

  * Safety Plans
  * Crisis Resources
  * Discharge Resources
* Clinical Resources

  * Documentation
  * Treatment Planning
  * Assessments
* School Resources

  * Referral Documents
  * Parent Resources
  * School Staff Resources
* Administrative

  * Procedures
  * HR
  * Billing
* Tutoring

  * Learning Plans
  * Assessments
  * Parent Resources

Folders should support:

* Rename
* Move
* Duplicate
* Archive
* Delete
* Permissions
* Description
* Owner
* Agency assignment

Do not require every resource to belong to a folder.

Resources may instead exist solely within a category.

---

# Adding a Resource

Clicking **+ Add Resource** should open a modal or side panel.

Ask:

### What would you like to add?

Options:

**Upload File**

**Add Link**

**Create Folder**

---

# Upload File

Allow drag-and-drop or file selection.

Supported common formats should include:

* PDF
* DOC
* DOCX
* XLS
* XLSX
* CSV
* PPT
* PPTX
* JPG
* JPEG
* PNG
* TXT

After uploading, ask for:

### Resource Name

Allow the system to automatically suggest the filename without the extension.

### Description

Short explanation of what the resource is and when it should be used.

### Category

Dropdown.

### Folder

Optional.

### Tags

Allow multiple.

Examples:

* Crisis
* Anxiety
* Children
* Adults
* Parents
* School
* Documentation
* Medicaid
* Intake
* Safety

### Resource Audience

Allow one or more:

* All Staff
* Clinical Providers
* Administrative Staff
* Supervisors
* Tutors
* Coaches
* Clients
* Parents / Guardians
* School Partners
* Specific Role

### Agency

For multi-agency environments allow:

* All Agencies
* Specific Agency
* Multiple Agencies

### Visibility

Options:

* Internal
* Client Shareable
* Publicly Shareable

### Featured Resource

Toggle.

Featured resources should appear prominently on the Library homepage.

---

# Add Link

Links must function as first-class Library resources.

Do **not** treat links as simple text notes.

When clicking **Add Link**, collect:

### Resource Name

Example:

988 Suicide & Crisis Lifeline

### URL

Example:

https://988lifeline.org

### Description

Example:

National suicide and crisis support resource available 24/7.

### Category

### Folder

Optional.

### Tags

### Audience

### Agency

### Visibility

### Featured Resource

The system should automatically attempt to retrieve:

* Website title
* Website favicon
* Domain
* Link preview when available

Display a clear **external link icon**.

When opened, the resource should open in a new browser tab.

---

# Resource Cards / List

Allow users to toggle between:

**List View**

and

**Grid View**

---

# List View

Columns should include:

| Resource | Type | Category | Updated | Owner | Actions |
| -------- | ---- | -------- | ------- | ----- | ------- |

Resource type should visually identify:

* PDF
* Word
* Spreadsheet
* Presentation
* Image
* Link
* Folder

Use recognizable icons.

---

# Grid View

Each resource card should show:

* File/link icon
* Resource name
* Short description
* Category
* File type
* Last updated
* Favorite button
* Three-dot actions menu

---

# Resource Detail View

Clicking a resource should open a detailed preview page or side panel.

Display:

### Resource Name

### Description

### Preview

Preview common supported files without requiring download whenever technically possible.

Examples:

* PDFs
* Images
* Documents

### Resource Information

* Category
* Folder
* Tags
* Uploaded by
* Date added
* Last updated
* File size
* Version
* Agency
* Audience
* Visibility

Actions:

* Open
* Preview
* Download
* Share
* Copy Link
* Favorite
* Replace File
* Move
* Edit Details
* Archive
* Delete

For links:

* Visit Website
* Copy Link
* Edit Link

---

# Favorites

Users should be able to star resources.

Create:

**My Favorites**

This should provide fast access to frequently used resources.

Favorites are user-specific.

---

# Recently Viewed

Create:

**Recently Viewed**

Track recently accessed Library resources.

---

# Recently Added

Display newly uploaded or created resources.

---

# Recently Updated

Display resources that have recently changed.

---

# Featured Resources

Administrators should be able to mark important resources as Featured.

Examples:

* Current Safety Plan
* Current Disclosure Form
* Crisis Resource Guide
* Current Documentation Guide

Featured resources should appear prominently near the top of Library.

---

# Collections

In addition to folders, allow admins to create **Collections**.

Collections are curated groups of resources without changing where the files are stored.

Examples:

### New Provider Toolkit

* Documentation Guide
* Safety Plan
* Crisis Resource Guide
* Treatment Plan Guide
* Medicaid Documentation Standards

### School Support Toolkit

* Referral Form
* Parent Guide
* School Safety Resource
* School Contact Guide

### Crisis Resources

* 988 Crisis Lifeline
* Safety Plan
* Emergency Contact Guide
* Colorado Crisis Services

A resource can belong to multiple Collections.

---

# Permissions

The Library must respect role-based access controls.

Potential permissions:

### View Library

### Upload Resources

### Add Links

### Create Folders

### Edit Resources

### Delete Resources

### Manage Categories

### Manage Collections

### Manage Library Permissions

### Share Client-Facing Resources

Administrators should have complete access.

Other users should only see resources they have permission to access.

---

# Multi-Agency Support

The Library must support multiple agencies/tenants.

Every resource should have an agency scope.

Options:

* Global / Platform Resource
* All Agencies
* Specific Agency
* Multiple Agencies

Super Admins may create resources available across multiple organizations.

Agency admins should only manage their organization's resources unless additional permissions are granted.

---

# Resource Sharing

Allow internal sharing.

Users should be able to:

**Copy Internal Link**

This link should open the resource directly inside the app for authorized users.

Example:

> app.example.com/library/resource/12345

---

# Client Sharing

Resources marked **Client Shareable** may be sent to clients or guardians.

Potential future integration:

From a client profile:

**Send Resource**

Search Library.

Select:

> Youth Safety Plan

Send via:

* Client Portal
* Secure Message
* Email
* SMS link, if permitted

Track:

* Sent date
* Recipient
* Sender
* Resource version

---

# Version Control

Resources should support basic version history.

When replacing a file:

Ask:

**Replace existing version?**

Preserve previous versions.

Example:

Safety Plan Template

Version 3
Updated August 29, 2026

Version History:

* v3 — August 29, 2026
* v2 — June 4, 2026
* v1 — January 12, 2026

Allow authorized administrators to restore previous versions.

---

# Expiration / Review Dates

Allow administrators to optionally set:

**Review Date**

Example:

Review by January 1, 2027

This is useful for:

* Policies
* Consent documents
* Clinical guides
* Billing instructions
* State resources
* Compliance resources

Resources approaching review should be surfaced to administrators.

Statuses could include:

* Current
* Review Soon
* Needs Review
* Archived

---

# Resource Ownership

Every resource should record:

**Owner**

This may be:

* Specific user
* Department
* Agency

Examples:

Clinical Department
Billing Team
Compliance
Administration

The owner is responsible for maintaining the resource.

---

# Admin Library Management

Create an administrative area:

**Library Settings**

Sections:

### Categories

Create, rename, reorder, archive categories.

### Tags

Manage commonly used tags.

### Permissions

Determine who can:

* View
* Add
* Edit
* Delete
* Share

### Resource Types

Manage custom resource classifications.

### Agencies

Manage cross-agency visibility.

### Review Queue

Show documents requiring review.

### Archived Resources

Allow restoring archived resources.

---

# Homepage Layout

The primary Library page should approximately follow this layout:

## Top

Library title

Search

Filters

* Add Resource

---

## Browse by Category

Large cards:

* Guides & Resources
* Templates
* Forms & Assessments
* Care Documents
* Policies & Procedures
* Community & External Resources

---

## Main Resource Area

Tabs:

**Recent**

**All Resources**

**Favorites**

**Shared With Me**

---

## Right Sidebar

### Quick Access

* Upload File
* Add Link
* Create Folder
* Create Collection

### Recently Updated

Show approximately 3–5 resources.

---

# Filters

Allow filtering by:

* Category
* Resource Type
* File Type
* Tags
* Agency
* Audience
* Owner
* Date Added
* Last Updated
* Featured
* Client Shareable
* Folder

Filters should combine with search.

---

# Sorting

Allow sorting by:

* Name
* Recently Added
* Recently Updated
* Most Viewed
* Most Used
* Owner
* Category

---

# Audit Log

Maintain an audit history for important Library actions.

Track:

* Resource uploaded
* Resource viewed
* Resource downloaded
* Resource edited
* Resource replaced
* Resource shared
* Resource archived
* Resource deleted
* Link added
* Permission changed

Include:

* User
* Timestamp
* Action
* Resource

---

# Notifications

Potential notifications:

### Resource Updated

Notify affected users when a critical resource is updated.

Example:

> The Safety Plan Template has been updated.

Admins should be able to determine whether an update triggers notification.

---

# Resource Requests

Include:

**Request a Resource**

Users can request:

* New guide
* Template
* Form
* Care document
* Community resource
* Updated document
* Other

Collect:

* Resource requested
* Reason
* Description
* Priority
* Requester

Administrators can manage requests.

Statuses:

* Submitted
* Reviewing
* In Progress
* Added
* Declined

---

# Important UX Requirement

The Library should feel closer to:

**Google Drive + an organizational knowledge base**

rather than a static document page.

Users should be able to quickly:

1. Search.
2. Browse.
3. Preview.
4. Download.
5. Save.
6. Add links.
7. Organize resources.
8. Favorite frequently used resources.
9. Share resources when appropriate.

Avoid excessive nested navigation.

The average staff member should be able to find a common resource in approximately **2–3 clicks**.

---

# Future AI Integration

Structure Library data so an AI assistant can eventually use authorized Library resources as internal knowledge.

Future functionality could allow a user to ask:

> Where is our current safety plan?

> What resources do we have for anxiety?

> Show me our school referral documents.

> What should I give a parent after a safety concern?

> Find our current treatment planning guide.

The AI should search only resources the requesting user has permission to access.

Potential future button:

**Ask Library**

This would provide an AI search/chat interface grounded in approved Library resources.

---

# Database Concept

At minimum, each Library resource should support:

```text
resource_id
agency_id
resource_name
description
resource_type
file_type
file_url
external_url
category_id
folder_id
owner_user_id
owner_department_id
visibility
audience
tags
featured
client_shareable
version
status
review_date
created_by
created_at
updated_by
updated_at
archived_at
```

Additional relational tables may include:

```text
library_categories
library_folders
library_tags
library_resource_tags
library_collections
library_collection_resources
library_permissions
library_versions
library_favorites
library_views
library_shares
library_resource_requests
library_audit_log
```

---

# Naming

The primary feature should be called:

# **Library**

Avoid names such as:

* File Manager
* Documents
* File Dump
* Drive

because this feature extends beyond files.

Internally describe Library as:

> Your organization's central home for resources, documents, templates, care materials, and useful links.

The navigation label should remain simply:

**Library**

---

# MVP Priority

Build the initial version with:

1. Library dashboard
2. Search
3. Categories
4. Upload files
5. Add links
6. Create folders
7. Grid/list views
8. Preview resources
9. Download resources
10. Favorites
11. Recently viewed
12. Permissions
13. Agency assignment
14. Tags
15. Edit resource metadata
16. Archive/delete
17. Quick Access
18. Recently Updated

After the MVP, add:

* Collections
* Version history
* Resource review dates
* Client sharing
* Resource requests
* Audit history
* Notifications
* AI-powered Ask Library
* Usage analytics

---

# Final Product Principle

Do not build Library as merely a place to upload documents.

Build it as the organization's **central resource infrastructure**.

Anything staff repeatedly need to:

* Find
* Read
* Download
* Use
* Reference
* Send
* Share
* Save
* Reuse

should eventually be able to live inside Library.
