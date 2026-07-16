# Dynamic StoryShelf Activity and Book Management Specification

**Activity name:** StoryShelf  
**Activity type:** Shared reading and mental health support activity  
**Supported platforms:** Mobile and web  
**Primary client platform:** Mobile  
**Primary provider platform:** Web  
**Initial content status:** All categories display **Coming Soon** until at least one approved book is published  
**Primary content format:** PDF  
**Required book information:** Title, description, cover image, PDF file, and category  

---

## 1. Activity Overview

StoryShelf is a dynamic digital bookshelf built into the platform’s counseling session and Games/Activities system.

The activity allows a provider and client to browse books organized by mental health support categories, select a book, and read the PDF together while remaining connected through the live video session.

The bookshelf is not a fixed collection. Authorized users must be able to add new PDF books over time through the Games/Activities administration area without requiring a new software release.

Each book added to the system will include:

- A title.
- A short description.
- A cover image or representative photo.
- A PDF file.
- One primary category.
- Optional secondary categories or tags.
- A publication status.

When a provider opens StoryShelf during a session, the provider and client will remain visible in their video windows. The bookshelf or selected book will occupy the majority of the remaining screen.

The activity supports three main experiences:

1. **Browse the bookshelf.**
2. **Choose a book from a mental health support category.**
3. **Read the selected PDF aloud, silently, or together during the video session.**

---

## 2. Primary Objective

The objective of StoryShelf is to provide a flexible, expandable collection of stories, educational materials, and guided reading resources that can support counseling conversations.

The activity should help providers introduce topics in a less direct and more approachable way. A book or short story can give the client a character, situation, or metaphor to discuss before connecting the topic to the client’s own experience.

StoryShelf should support:

- Emotional identification.
- Reflection.
- Perspective taking.
- Coping-skill education.
- Normalization of difficult experiences.
- Communication between client and provider.
- Guided discussion.
- Shared reading.
- Independent reading during or after a session.
- The gradual addition of new resources over time.

StoryShelf must remain an optional activity. The provider or client can pause the reading and return to the standard counseling interface at any time.

---

## 3. Initial Mental Health Support Categories

The initial bookshelf will contain the following categories.

All categories must initially display the status **Coming Soon** until one or more approved books have been published within that category.

| Category | Initial Status | Description |
|---|---|---|
| Feelings | Coming Soon | Books that help clients identify, name, understand, and communicate emotions |
| Anxiety | Coming Soon | Books about worry, nervousness, uncertainty, fear, and anxiety-management strategies |
| Self-Esteem | Coming Soon | Books about confidence, identity, self-worth, strengths, and positive self-perception |
| Friendship | Coming Soon | Books about making friends, maintaining relationships, boundaries, conflict, and connection |
| Change | Coming Soon | Books about transitions, new situations, moving, family changes, growing up, and adapting |
| Mindfulness | Coming Soon | Books about present-moment awareness, grounding, breathing, attention, and observation |
| Grief | Coming Soon | Books about loss, remembrance, missing someone, healing, and continuing bonds |
| Anger | Coming Soon | Books about frustration, anger cues, expression, regulation, repair, and problem solving |
| Stress | Coming Soon | Books about pressure, overwhelm, responsibilities, school stress, and stress-management tools |
| Hope | Coming Soon | Books about optimism, resilience, recovery, possibility, and looking forward |
| Courage | Coming Soon | Books about facing fears, trying difficult things, asking for help, and taking healthy risks |
| Belonging | Coming Soon | Books about inclusion, identity, acceptance, community, family, and feeling connected |

### 3.1 Future Categories

The system must allow additional categories to be added later without redesigning StoryShelf.

Possible future categories may include:

- Family.
- Bullying.
- School.
- Social Skills.
- Emotional Regulation.
- Depression.
- Loneliness.
- Trauma Recovery.
- Body Awareness.
- Sleep.
- Motivation.
- Boundaries.
- Communication.
- Conflict Resolution.
- Identity.
- Neurodiversity.
- Coping Skills.
- Life Skills.
- Problem Solving.
- Loss and Transition.

These future categories should not be displayed until they have been created and enabled by an authorized administrator.

---

## 4. Category Status Behavior

Each category must have a visible status.

Supported category statuses should include:

| Status | Meaning |
|---|---|
| Coming Soon | The category is visible, but no published books are currently available |
| Available | At least one published book is available |
| Featured | The category is available and has been selected for prominent placement |
| Hidden | The category exists but is not visible to providers or clients |
| Archived | The category is no longer active but is retained for historical records |

### 4.1 Automatic Coming Soon Logic

A category should display **Coming Soon** when:

- The category has no books.
- The category contains only draft books.
- The category contains only archived books.
- The category contains books that are not approved for the current organization.
- The category contains books that are not available to the current client’s age or program.

The **Coming Soon** label should automatically disappear when the first eligible book is published.

### 4.2 Coming Soon Client Experience

When a client selects a Coming Soon category, the interface should display:

> **Books for this topic are coming soon.**  
> New stories and resources will be added to this shelf over time.

The interface may also provide:

- Return to Shelf.
- Explore Another Topic.
- Notify Provider.
- Suggest a Topic, when enabled.

The client should never encounter an empty or broken-looking screen.

---

## 5. User Roles

### 5.1 Client

The client can:

- Browse available categories.
- Open an available category.
- View book covers and descriptions.
- Select a book.
- Accept or decline a provider’s book suggestion.
- Read the selected PDF.
- Navigate pages when given control.
- Request that the provider navigate.
- Pause reading.
- Add a private bookmark.
- Save an optional reflection.
- Return to the bookshelf.
- Return to the standard counseling interface.

The client cannot:

- Upload books.
- Edit book metadata.
- Publish books.
- Delete books.
- View provider-private notes.
- Access unavailable or restricted content.

### 5.2 Provider

The provider can:

- Open StoryShelf during a session.
- Browse categories.
- Preview books.
- Suggest a book to the client.
- Open a book after client acknowledgment.
- Control shared page navigation.
- Transfer page-control permission to the client.
- Add discussion markers.
- Pause reading.
- Return to the bookshelf.
- Add a private session note.
- Add a shared note.
- Save a client-approved reflection.
- Assign an approved book for later reading when that feature is enabled.

The provider should not automatically receive permission to publish or administer books unless assigned an additional content-management role.

### 5.3 Content Manager or Administrator

An authorized content manager can:

- Add books.
- Upload PDFs.
- Upload cover images.
- Add titles and descriptions.
- Assign categories.
- Add content notes.
- Add age and reading-level information.
- Preview books.
- Save drafts.
- Submit books for review.
- Publish books.
- Unpublish books.
- Archive books.
- Replace PDF files.
- Replace cover images.
- Move books between categories.
- Reorder books on a shelf.
- Feature selected books.
- Create new categories.
- Hide or archive categories.

### 5.4 Content Reviewer

When the organization uses a review workflow, a content reviewer can:

- Review the PDF.
- Review the title and description.
- Review category placement.
- Review content notes.
- Approve the book.
- Request changes.
- Reject the book.
- Publish the approved version when authorized.

---

# Part I: Client and Provider StoryShelf Experience

## 6. Opening StoryShelf During a Session

StoryShelf will be available within the Games/Activities section of the live counseling session.

The provider selects:

> **Games & Activities → StoryShelf**

The provider sees a preview containing:

- StoryShelf name.
- Short description.
- Supported platforms.
- Available categories.
- Approximate activity duration.
- Client-facing preview.
- Open Shelf button.
- Cancel button.

The client then sees an invitation:

> **Jamie would like to open StoryShelf.**  
> Choose a topic and read a story aloud or together. You can pause or return to the conversation at any time.

Client actions:

- **Open StoryShelf**
- **Not Right Now**

The activity should not disconnect or restart the video session.

---

## 7. Main Bookshelf Interface

The main StoryShelf interface should visually resemble a digital bookshelf.

Visual assets:

- Empty shelf background: `/branding/activities/Bookshelf.png` (also in repo `assets/Bookshelf.png`).
- Top shelf: clickable category spines.
- Bottom shelf: book covers with title and short description for the selected category.

Each category should appear as one of the following:

- A book spine.
- A shelf section.
- A category card.
- A labeled row of books.
- A topic tile with a bookshelf visual.

The web interface may use full book spines across a large wooden or illustrated bookshelf.

The mobile interface may use:

- A horizontal category carousel.
- Vertically stacked shelf sections.
- Topic cards styled as book spines.
- A swipeable shelf.

### 7.1 Main Shelf Information

Each category should show:

- Category name.
- Category icon.
- Short description.
- Availability status.
- Number of published books when available.
- Coming Soon label when no published books are available.

Example:

```text
Grief
Stories about loss, remembrance, healing, and continuing bonds.
Coming Soon
```

When books become available:

```text
Grief
Stories about loss, remembrance, healing, and continuing bonds.
6 Books
```

### 7.2 Session Video Placement

The provider and client must remain visible while browsing StoryShelf.

Recommended web placement:

- Provider video in the upper-left corner.
- Client video in the upper-right corner.
- Bookshelf occupying the majority of the screen.
- Minimal session controls in the header or bottom center.

Recommended mobile placement:

- Two compact video tiles at the top.
- Bookshelf below the video tiles.
- Session controls collapsed into a small bottom tray.
- One category or book emphasized at a time.

---

## 8. Category Selection Interface

When an available category is selected, the shelf should transition to display the books assigned to that category.

The category view should contain:

- Category name.
- Category description.
- Back to All Topics action.
- Published book count.
- Book-cover grid or carousel.
- Optional filter or sort control.
- Participant video tiles.
- Minimal session controls.

### 8.1 Book Cover Presentation

Each book card should display:

- Cover image.
- Title.
- Short description.
- Estimated reading time, when available.
- Reading level or age range, when available.
- Content note indicator, when applicable.
- New or Featured badge, when applicable.

### 8.2 Book Ordering

Authorized content managers should be able to control the order in which books appear.

Supported ordering options may include:

- Custom shelf order.
- Featured first.
- Newest first.
- Alphabetical.
- Shortest reading time.
- Reading level.

The default should be a manually curated shelf order.

### 8.3 Empty Category Presentation

If the category is Coming Soon, the selected category view should display:

```text
Grief

Books for this topic are coming soon.

New stories and resources will be added to this shelf over time.

[Explore Another Topic]
```

No empty cover placeholders should appear unless intentionally designed as decorative Coming Soon cards.

---

## 9. Book Detail and Preview Interface

Selecting a book opens a preview before the PDF reader begins.

The preview should display:

- Large cover image.
- Book title.
- Description.
- Category.
- Estimated reading time.
- Page count.
- Reading level or recommended age range.
- Author or source, when available.
- Content note, when applicable.
- Available reading modes.
- Open Book action.
- Return to Shelf action.

### 9.1 Required Book Actions

Provider actions:

- Preview Book.
- Suggest to Client.
- Open Together.
- Add Private Note.
- Return to Shelf.

Client actions:

- Read This Book.
- Not Right Now.
- Return to Shelf.

### 9.2 Suggested Client Prompt

> **Would you like to read this book?**  
> You can read aloud, take turns, follow along while your provider reads, or stop at any time.

Actions:

- **Read Together**
- **Choose Another Book**

---

## 10. Shared PDF Reading Interface

After the book is opened, the PDF reader becomes the primary interface.

The provider and client remain visible in compact video tiles.

### 10.1 PDF Reader Requirements

The reader must support:

- Previous page.
- Next page.
- Current page number.
- Total page count.
- Page thumbnails.
- Zoom in.
- Zoom out.
- Fit to width.
- Fit to page.
- Full-screen reading mode.
- Exit full-screen mode.
- Return to book details.
- Return to shelf.
- Return to counseling.
- Bookmarks.
- Shared page synchronization.
- Reconnection and reading-position restoration.

### 10.2 Shared Page Synchronization

When shared reading is enabled:

- Provider and client see the same page.
- Page changes synchronize in real time.
- The participant currently controlling navigation is clearly indicated.
- The provider may give page control to the client.
- The client may request page control.
- Either participant may request a pause.
- Reconnection restores the last confirmed shared page.

Example status:

```text
Jamie is controlling the pages
Page 4 of 12
```

Or:

```text
You are controlling the pages
Page 4 of 12
```

### 10.3 Reading Modes

StoryShelf should support the following reading modes:

1. **Provider Reads Aloud**
   - Provider controls pages by default.
   - Client follows along.

2. **Client Reads Aloud**
   - Client controls pages by default.
   - Provider follows along.

3. **Take Turns**
   - Provider and client alternate by page, paragraph, or section.
   - The interface may show whose turn is next.

4. **Read Together**
   - Provider and client read or discuss the book collaboratively.
   - Either participant may control pages.

5. **Silent Shared Reading**
   - Both participants read silently.
   - A Ready for Next Page action can prevent accidental page changes.

6. **Listen and Follow**
   - Available only when the book has approved narration.
   - Narration is optional and must not interfere with session audio.

No reading mode should automatically record the client or provider.

---

## 11. Reading Discussion Tools

The PDF reader may include a discreet discussion tool.

The provider can place a discussion marker on a page without interrupting immediately.

At an appropriate stopping point, the provider can open the marker and ask a question.

Examples:

- “What stood out to you on this page?”
- “How do you think the character is feeling?”
- “What clues helped you understand that?”
- “What might the character need?”
- “What would you say to this character?”
- “Does this remind you of another story or situation?”
- “Would you like to keep reading or pause here?”

### 11.1 Shared Reflection

At the end of a book, the interface may show:

- What part stood out?
- Which character or idea was most memorable?
- Was anything helpful?
- Was anything uncomfortable or unclear?
- Would you like to save a thought about the book?
- Would you like to discuss the story or leave it there for today?

The client should be able to:

- Save a private reflection.
- Share the reflection with the provider.
- Skip reflection.
- Return to counseling.

---

## 12. Ending the Reading Activity

The book can be closed in several ways:

- Finish Book.
- Pause and Save Place.
- Return to Shelf.
- Return to Counseling.
- End Session.

If the book is not complete, the system should ask:

> **Save your place before leaving?**

Actions:

- Save Bookmark.
- Leave Without Saving.
- Continue Reading.

The activity should remember the reading position only when permitted by the platform’s data and privacy settings.

---

# Part II: Mobile and Web Behavior

## 13. Mobile Client Experience

Most client sessions are expected to occur on mobile devices.

The mobile StoryShelf interface must prioritize:

- One primary action at a time.
- Large book covers.
- Large touch targets.
- Minimal text on the main shelf.
- Swipeable categories.
- Swipeable book covers.
- Compact participant videos.
- Easy pause and exit controls.
- Single-page PDF reading.
- Responsive zoom.
- Reliable use on cellular connections.

### 13.1 Mobile Bookshelf Layout

Recommended order:

1. Session status.
2. Provider and client video tiles.
3. StoryShelf title.
4. Category carousel.
5. Selected category description.
6. Book cover carousel or Coming Soon message.
7. Session controls.

### 13.2 Mobile PDF Layout

Recommended order:

1. Compact session header.
2. Floating or compact video tiles.
3. PDF page.
4. Page number.
5. Previous and next controls.
6. Reading control tray.

The mobile reader should not display a dense desktop toolbar.

The default control tray may contain:

- Previous.
- Page number.
- Next.
- More.

The More menu may contain:

- Zoom.
- Bookmark.
- Reading mode.
- Transfer page control.
- Return to Shelf.
- Return to Counseling.

### 13.3 Mobile Performance

When bandwidth or device performance is limited:

1. Preserve session audio.
2. Preserve the PDF page.
3. Preserve reading position.
4. Reduce video resolution.
5. Disable page-transition animation.
6. Load lower-resolution PDF previews where appropriate.
7. Hide decorative bookshelf animation.

---

## 14. Web Provider Experience

The web provider interface may use:

- Participant videos at the top.
- Bookshelf in the center.
- Provider-only tools in a right-side drawer.
- Collapsible navigation on the left.
- Minimal session controls.
- Large book-cover grid.
- Larger PDF reading canvas.

### 14.1 Provider-Specific Web Tools

The provider may access:

- Client-visible book details.
- Private content summary.
- Content notes.
- Suggested discussion questions.
- Reading-mode control.
- Page-control assignment.
- Shared notes.
- Provider-private notes.
- Pause activity.
- Return to shelf.
- End activity.

These provider-only tools must never appear on the client’s interface.

---

## 15. Responsive Differences

| Feature | Mobile Client | Web Client | Web Provider |
|---|---|---|---|
| Category navigation | Swipeable carousel or stacked list | Grid or shelf | Full shelf with management context |
| Book presentation | One large cover at a time | Multi-cover grid | Multi-cover grid |
| PDF view | Single-page vertical view | Single- or two-page view | Single- or two-page view |
| Video | Compact top strip or floating tiles | Floating or top strip | Top strip or side-by-side |
| Page thumbnails | Hidden in drawer | Optional side panel | Available side panel |
| Discussion tools | One prompt at a time | Shared panel | Provider facilitation panel |
| Page control | Tap-based | Mouse and keyboard | Full controls |
| Notes | Client-private and shared only | Client-private and shared only | Private and shared |
| Content management | Not available | Not available unless authorized | Available to authorized users |
| Book upload | Not available | Not available unless authorized | Available in Games/Activities administration |

---

# Part III: Games/Activities Book Management

## 16. Games/Activities Administration Area

Authorized users need a way to add and manage StoryShelf books through the existing Games/Activities section.

Recommended navigation:

```text
Games & Activities
  ├── Activity Library
  ├── StoryShelf
  │     ├── Books
  │     ├── Categories
  │     ├── Drafts
  │     ├── Review Queue
  │     └── Archived
  └── Activity Settings
```

The StoryShelf management page should include:

- Add Book button.
- Search.
- Category filter.
- Status filter.
- Age-range filter.
- Sort control.
- Book table or card grid.
- Draft count.
- Review count.
- Published count.
- Archived count.

---

## 17. Book Library Management Screen

Each managed book card or row should show:

- Cover image.
- Title.
- Primary category.
- Status.
- Last updated date.
- PDF file name.
- Page count.
- Reading time.
- Visibility.
- Actions menu.

Supported actions:

- Preview.
- Edit.
- Duplicate.
- Move to Category.
- Submit for Review.
- Publish.
- Unpublish.
- Replace PDF.
- Replace Cover.
- Archive.
- Restore.
- Delete Draft.

Published books should generally be archived rather than permanently deleted so that historical session references remain valid.

---

## 18. Add Book Workflow

The content manager selects:

> **Games & Activities → StoryShelf → Add Book**

The Add Book workflow should use a guided form.

### Step 1: Upload PDF

Required:

- PDF file.

Validation:

- File must be a valid PDF.
- File must not be password protected unless the platform explicitly supports password processing.
- File must open successfully.
- File size must remain within the configured limit.
- Page count should be detected automatically.
- Malware and security scanning must complete.
- Text accessibility should be evaluated where possible.

The interface should show:

- File name.
- File size.
- Page count.
- Upload progress.
- Processing status.
- Replace file action.
- Remove file action.

### Step 2: Add Cover Image

Required:

- Cover image or representative photo.

Supported formats may include:

- JPG.
- PNG.
- WebP.

The interface should support:

- Upload image.
- Crop image.
- Reposition image.
- Preview mobile crop.
- Preview web crop.
- Add alternative text.
- Replace image.
- Remove image.

Recommended image fields:

- Cover image.
- Cover alternative text.
- Focal-point selection.

The cover image should not be generated automatically from the first PDF page unless the user explicitly chooses that option.

### Step 3: Add Book Information

Required fields:

- Title.
- Short description.
- Primary category.
- Cover image.
- Cover-image alternative text.
- PDF file.

Optional but recommended fields:

- Subtitle.
- Author.
- Publisher or source.
- Long description.
- Secondary categories.
- Topic tags.
- Recommended age range.
- Reading level.
- Estimated reading time.
- Language.
- Content notes.
- Provider guidance.
- Suggested discussion questions.
- Copyright or license information.
- Effective date.
- Expiration or review date.

### Step 4: Assign Category

The content manager selects one primary category.

Initial category options:

- Feelings.
- Anxiety.
- Self-Esteem.
- Friendship.
- Change.
- Mindfulness.
- Grief.
- Anger.
- Stress.
- Hope.
- Courage.
- Belonging.

The content manager may optionally assign:

- Secondary categories.
- Search tags.
- Program-specific collections.
- Age-specific collections.

A book should appear once on its primary shelf. Secondary categories may show the same book as a linked item without creating duplicate files.

### Step 5: Configure Availability

Availability controls may include:

- All organizations.
- Selected organization.
- Selected program.
- Selected provider group.
- Selected age range.
- Mobile availability.
- Web availability.
- Available during live sessions.
- Available outside sessions.
- Client self-access enabled or disabled.
- Featured status.
- Publication start date.
- Publication end date.

### Step 6: Preview

The preview must show:

- How the cover appears on mobile.
- How the cover appears on web.
- Category placement.
- Title and description.
- Book-detail screen.
- First several PDF pages.
- Reading-mode preview.
- Content notes.
- Accessibility information.

### Step 7: Save or Submit

Actions:

- Save Draft.
- Save and Continue Editing.
- Submit for Review.
- Publish, when the user has publishing permission.
- Cancel.

---

## 19. Required Book Fields

| Field | Required | Purpose |
|---|---:|---|
| Title | Yes | Name displayed on the shelf and in the reader |
| Short description | Yes | Brief explanation shown with the cover |
| Primary category | Yes | Main shelf where the book appears |
| Cover image or photo | Yes | Visual displayed on the shelf |
| Cover alternative text | Yes | Accessible description of the cover |
| PDF file | Yes | Book or reading resource |
| Status | Yes | Draft, review, published, unpublished, or archived |
| Language | Recommended | Supports filtering and localization |
| Page count | Automatic | Reader and preview information |
| File size | Automatic | Performance and validation |
| Reading time | Recommended | Helps provider and client choose a book |
| Age range | Recommended | Supports appropriate content selection |
| Reading level | Recommended | Supports accessibility and client fit |
| Content note | Conditional | Required when a topic may require advance notice |
| License or rights record | Recommended | Confirms permission to distribute the PDF |

---

## 20. Book Status Workflow

| Status | Meaning |
|---|---|
| Draft | Book is being created and is not visible in StoryShelf |
| In Review | Book has been submitted for content and technical review |
| Changes Requested | Reviewer has returned the book to the editor |
| Approved | Book is approved but not yet visible |
| Scheduled | Book will become available on a future date |
| Published | Book is visible to eligible users |
| Unpublished | Book is temporarily removed from the shelf |
| Archived | Book is no longer available but is retained for historical records |
| Rejected | Book was not approved for publication |

Recommended workflow:

```text
Draft
  ↓
In Review
  ├── Changes Requested → Draft
  ├── Rejected
  └── Approved
         ↓
Published or Scheduled
         ↓
Unpublished or Archived
```

---

## 21. Editing an Existing Book

Authorized users must be able to edit:

- Title.
- Description.
- Cover image.
- Alternative text.
- Category.
- Tags.
- Reading time.
- Age range.
- Reading level.
- Content notes.
- Provider guidance.
- Discussion prompts.
- Availability.
- Shelf order.

### 21.1 Replacing a PDF

When replacing the PDF:

- The existing published version should remain available until the replacement is approved.
- The replacement should create a new book version.
- Existing bookmarks should be evaluated against the new page structure.
- The system should warn the editor if the page count changes.
- Historical sessions should retain the version originally used when required.
- The new version should receive its own review record.

### 21.2 Replacing a Cover

A cover can be updated without replacing the PDF.

The update should still support:

- Preview.
- Alternative text.
- Approval workflow when required.
- Version history.

---

## 22. Shelf Ordering

Within each category, the content manager should be able to reorder books through:

- Drag and drop.
- Move Up or Move Down actions.
- Numeric shelf position.
- Pin to Beginning.
- Feature Book.

A keyboard-accessible alternative to drag and drop is required.

The selected order should be reflected in:

- Web bookshelf.
- Mobile carousel.
- Provider preview.
- Client view.

---

## 23. Category Management

Authorized users should have a separate Categories screen.

Each category record should contain:

- Category name.
- Category description.
- Icon.
- Shelf color or approved visual token.
- Display order.
- Status.
- Coming Soon text.
- Number of draft books.
- Number of published books.
- Age or program restrictions.
- Visibility.

Supported actions:

- Add Category.
- Edit Category.
- Reorder Categories.
- Hide Category.
- Feature Category.
- Archive Category.

### 23.1 Category Creation Fields

Required:

- Category name.
- Short description.
- Icon.
- Display order.
- Visibility.

Optional:

- Long description.
- Default discussion guidance.
- Content-review requirements.
- Age range.
- Organization restrictions.
- Custom Coming Soon message.

---

# Part IV: Book Data Structure

## 24. Example Book Record

```json
{
  "id": "book_grief_001",
  "title": "The Star I Still See",
  "subtitle": null,
  "shortDescription": "A short story about remembering someone with love.",
  "longDescription": "A reflective story designed to help a provider and client discuss memory, connection, and grief in an approachable way.",
  "primaryCategoryId": "grief",
  "secondaryCategoryIds": [
    "hope"
  ],
  "tags": [
    "loss",
    "memory",
    "connection",
    "hope"
  ],
  "cover": {
    "assetId": "asset_cover_001",
    "alternativeText": "A child sitting beneath a star-filled sky beside a glowing tree.",
    "focalPoint": {
      "x": 0.5,
      "y": 0.4
    }
  },
  "pdf": {
    "assetId": "asset_pdf_001",
    "fileName": "the-star-i-still-see.pdf",
    "pageCount": 12,
    "fileSizeBytes": 4821930,
    "version": 1
  },
  "author": "Example Author",
  "language": "en",
  "estimatedReadingMinutes": 10,
  "recommendedAgeRange": {
    "minimum": 10,
    "maximum": 17
  },
  "readingLevel": "Middle Grade",
  "contentNotes": [
    "Discusses the death of a loved one",
    "Contains themes of grief and remembrance"
  ],
  "providerGuidance": "Preview the story before using it with a client who has experienced a recent loss.",
  "discussionQuestions": [
    "What memory felt most important to the character?",
    "What helped the character feel connected?"
  ],
  "availability": {
    "platforms": [
      "mobile",
      "web"
    ],
    "liveSession": true,
    "outsideSession": false
  },
  "status": "published",
  "shelfPosition": 1,
  "featured": false,
  "createdAt": "2026-07-16T12:00:00Z",
  "updatedAt": "2026-07-16T12:00:00Z",
  "publishedAt": "2026-07-16T12:00:00Z"
}
```

---

## 25. Example Category Record

```json
{
  "id": "grief",
  "displayName": "Grief",
  "description": "Books about loss, remembrance, missing someone, healing, and continuing bonds.",
  "icon": "heart-star",
  "status": "coming_soon",
  "displayOrder": 7,
  "comingSoonMessage": "Books for grief support are coming soon.",
  "publishedBookCount": 0,
  "visible": true
}
```

When the first eligible book is published, the category can update automatically:

```json
{
  "status": "available",
  "publishedBookCount": 1
}
```

---

# Part V: PDF Processing and Reader Requirements

## 26. PDF Upload Processing

Every uploaded PDF should pass through:

- File-type validation.
- Malware scanning.
- Page-count extraction.
- File-size validation.
- PDF rendering validation.
- Thumbnail generation.
- Accessibility evaluation where supported.
- Text extraction where permitted.
- Rights and license confirmation workflow.
- Version creation.

The upload process should never make a book immediately visible unless the uploader has direct publishing permission and all required checks pass.

---

## 27. PDF Accessibility

Books should be evaluated for:

- Selectable text.
- Logical reading order.
- Tagged headings.
- Alternative text for meaningful images.
- Sufficient contrast.
- Searchable content.
- Screen-reader compatibility.
- Appropriate language metadata.
- Correct page orientation.

When a PDF does not meet the organization’s accessibility standard, the interface should:

- Flag the issue.
- Prevent publication when required.
- Allow an accessible replacement.
- Require an approved exception when applicable.

---

## 28. PDF Rights and Licensing

Before publication, the content manager should confirm that the organization has the right to store, display, and share the PDF.

The book record may include:

- Copyright owner.
- License type.
- Source.
- Permission document.
- Usage restrictions.
- Expiration date.
- Organization limitations.

The platform should not assume that possession of a PDF grants permission to distribute it.

---

# Part VI: Privacy, Safety, and Content Governance

## 29. Reading Privacy

By default, StoryShelf should not:

- Record audio.
- Record video.
- Save spoken reading.
- Analyze reading ability.
- Analyze facial expressions.
- Generate emotional scores.
- Automatically diagnose a client.
- Save unshared reflections.
- Save provider-private notes to the client-facing record.

The system may save:

- Book selected.
- Book version.
- Current page or bookmark.
- Activity start and end.
- Client-approved reflection.
- Shared note.
- Provider-private documentation through the approved notes system.

---

## 30. Sensitive Content Controls

Books related to sensitive topics should support:

- Provider preview.
- Content note.
- Age guidance.
- Reading-level guidance.
- Skip option.
- Alternative book suggestions.
- Immediate return to counseling.
- Organization-specific availability.
- Program-specific approval.

For grief content, the interface should not assume:

- The client wants to discuss a personal loss.
- Grief follows a single sequence.
- The client should “move on.”
- The activity will make the client feel better immediately.

Appropriate language includes:

- Remembering.
- Making meaning.
- Missing someone.
- Continuing bonds.
- Carrying memories.
- Finding support.
- Making space for different feelings.

---

# Part VII: Empty, Loading, and Error States

## 31. Empty States

### Category Has No Books

```text
Books for this topic are coming soon.

New stories and resources will be added to this shelf over time.

[Explore Another Topic]
```

### No Search Results

```text
No books matched your search.

Try another title, topic, or category.

[Clear Search]
```

### No Books Available for Client

```text
There are no books currently available for this session.

You can return to the conversation or choose another activity.

[Return to Counseling]
```

---

## 32. Loading States

Loading messages should be calm and specific:

- Loading StoryShelf.
- Opening the Grief shelf.
- Preparing your book.
- Loading page 4.
- Restoring your reading position.
- Reconnecting to the shared reading session.

The interface should prioritize maintaining session audio while a PDF loads.

---

## 33. Error States

### PDF Fails to Open

```text
This book could not be opened right now.

Your counseling session is still connected.

[Try Again]
[Choose Another Book]
[Return to Counseling]
```

### Connection Is Lost

```text
Reconnecting to the shared reading session.

Your place in the book has been saved.
```

### Cover Image Is Missing

Use a standard accessible book placeholder containing:

- Book title.
- Category icon.
- Neutral cover treatment.

A missing image should not prevent the PDF from being opened.

### Book Becomes Unavailable

```text
This book is no longer available.

Please choose another book or return to the conversation.
```

---

# Part VIII: Acceptance Criteria

## 34. Client and Provider Activity Acceptance Criteria

StoryShelf is ready for use when:

- StoryShelf can be launched from Games/Activities.
- Launching StoryShelf does not disconnect the video session.
- Both provider and client remain visible.
- All initial categories are displayed.
- Every initial category displays Coming Soon when it contains no eligible published books.
- Publishing the first eligible book automatically makes its category available.
- Books display a title, description, cover image, and category.
- A client can select a book.
- A provider can suggest a book.
- A PDF can be opened inside the live session.
- Shared page navigation works.
- Page control can be assigned to the provider or client.
- A client can pause or decline reading.
- A client can return to the shelf.
- A client can return to standard counseling.
- Reading position can be restored after reconnection.
- Provider-private notes never appear on the client screen.
- No audio or video is recorded by StoryShelf by default.
- Mobile portrait reading is usable.
- Web reading is keyboard accessible.
- Cover images have alternative text.
- Drag interactions have keyboard and button alternatives.
- Error states preserve the live session.

---

## 35. Book Management Acceptance Criteria

The management interface is ready when an authorized user can:

- Open StoryShelf management from Games/Activities.
- Add a new book.
- Upload a PDF.
- Upload a cover image or photo.
- Enter a title.
- Enter a description.
- Select a category.
- Preview the book.
- Save a draft.
- Submit the book for review.
- Publish the book when authorized.
- See the published book on the correct shelf.
- Edit book information.
- Replace the cover.
- Replace the PDF through versioning.
- Move the book to another category.
- Reorder books.
- Unpublish a book.
- Archive a book.
- Search books.
- Filter books by category and status.
- View upload and processing errors.
- Prevent unauthorized users from publishing.
- Automatically update Coming Soon category states.

---

# Part IX: Future Enhancements

## 36. Potential Future Features

The framework should support later additions such as:

- Audio narration.
- Multiple language editions.
- Read-along highlighting.
- Provider-created discussion questions.
- Client bookmarks.
- Personal reading lists.
- Recommended books.
- Recently read books.
- Assigned books.
- Independent reading outside a session.
- Printable reflection sheets.
- Provider-created collections.
- Organization-specific shelves.
- Seasonal collections.
- Book-series grouping.
- Search by skill or topic.
- Favorite books.
- Ratings from providers, not public client ratings.
- Reading analytics limited to approved operational use.
- Offline reading where security requirements permit.
- Interactive PDFs.
- Page annotations.
- Shared drawing or highlighting.
- Embedded videos when approved.
- Dynamic content packs.

These features should be optional modules and should not be required for the initial StoryShelf release.

---

# Part X: Final Product Description

StoryShelf is a dynamic, expandable mental health support bookshelf built into the platform’s live counseling experience.

The provider and client remain connected by video while browsing topic-based shelves and reading PDF books together. The bookshelf begins with the following categories:

- Feelings — Coming Soon.
- Anxiety — Coming Soon.
- Self-Esteem — Coming Soon.
- Friendship — Coming Soon.
- Change — Coming Soon.
- Mindfulness — Coming Soon.
- Grief — Coming Soon.
- Anger — Coming Soon.
- Stress — Coming Soon.
- Hope — Coming Soon.
- Courage — Coming Soon.
- Belonging — Coming Soon.

As books are added and published, each category automatically changes from Coming Soon to Available.

Authorized users manage the bookshelf through:

> **Games & Activities → StoryShelf**

From this area, they can:

- Upload a PDF.
- Add a title.
- Add a description.
- Upload a cover image or photo.
- Select the shelf category.
- Preview the book.
- Save it as a draft.
- Submit it for review.
- Publish it.
- Edit it.
- Reorder it.
- Unpublish or archive it.

This makes StoryShelf a content-driven activity rather than a fixed game. New books and categories can be added over time without redesigning the counseling interface or releasing a new version of the application.

---

## Implementation notes (current codebase)

- Empty shelf art is staged at `frontend/public/branding/activities/Bookshelf.png`.
- A pilot StoryShelf activity already exists as an embedded ActivityHost plugin with hardcoded short text stories (`frontend/src/activities/story-shelf/`). That pilot is **not** the PDF CMS described above.
- Target V1 build: replace the pilot shelf UI with the Bookshelf.png composition (category spines on top, covers on bottom), Coming Soon for all 12 categories, then layer PDF upload/admin + shared PDF reader.
