# Hybrid Book 3.0 Extension Specification: PDF Text Record and Phrase Map

This specification extends the Hybrid Book 3.0 standard (specifically extending Sections 6.1, 6.2, 6.4.3, and
Part III "Data File Structure") to define the integration, traversal, and mapping of PDF documents as text records.

---

## 1. Introduction and Scope

### 1.1. Context and Relationship to Section 6.4.3
Section 6.4.3 ("Text Construction" / *Stavba textu*) of the Hybrid Book 3.0 specification establishes that the
publication format does not mandate a single underlying data format for text records:

> *"Datový formát textového záznamu Hybridní kniha nespecifikuje. Konkrétní doporučení se vztahují k softwarovému
> prohlížeči hybridních knih. Formálně musí text obsahovat záznam o lokalizaci synchronizačních jednotek, tj.
> jednoznačný identifikátor fráze, pozice začátku fráze a informace o pozici nadpisu v hierarchii osnovy. Způsob, jak
> zapsat tyto informace do textového záznamu, se liší podle použitého formátu..."*

> *"The Hybrid Book standard does not specify the data format for the text record. Specific recommendations pertain
> to the hybrid book viewing software. Formally, the text must include data regarding the location of synchronization
> units, specifically, a unique phrase identifier, the phrase's starting position, and information on the heading's
> position within the outline hierarchy. The method of encoding this information in the text record varies depending on
> the format used..."*

While the original reference implementation targeted HTML documents with CSS styling (and optionally XML with XSLT),
accessible publishing frequently demands the presentation of Portable Document Format (PDF; ISO 32000-1 and
ISO 32000-2) materials. PDF documents provide fixed-layout visual fidelity, exact facsimile reproduction of printed
educational works, and standardized typography suitable for low-vision and hearing-impaired readers.

However, unlike HTML, where individual DOM nodes admit explicit string identifiers via the `id` attribute (e.g.
`<p id="phr:32">` or `<span id="phr:42">`), PDF content streams are compiled, binary-encoded, and compressed. Directly
injecting external phrase identifiers into PDF content streams compromises format compliance, breaks document digital
signatures, invalidates cross-reference tables, and disrupts third-party rendering engines.

In adherence to Section 4.1 (*"Oddělený popisný aparát"* / Separated Descriptive Apparatus), which requires that
synchronization and navigational metadata remain decoupled from raw media content, this extension introduces an
external XML phrase map descriptor (`phrase_map.xml`). The phrase map maps the logical synchronization and navigation
units (phrases) to specific PDF Marked Content sequences and page numbers.

### 1.2. Purpose and Normative Scope
This document formally specifies:
1. The placement and naming conventions of the PDF file and its accompanying XML phrase map within the Hybrid Book
   document file structure.
2. The synchronization mechanism connecting `[sync].xml` to `phrase_map.xml` and the underlying PDF.
3. The abstract models for PDF content ingestion, marked content extraction, and logical structure tree resolution.
4. The differential handling of property-bearing (`BDC`) and property-less (`BMC`) marked content, and the rules
   governing canonical sequential identifier assignment in document traversal order.
5. The canonical sequential identification model decoupling persistent document descriptors from ephemeral runtime
   viewer identifiers.
6. The hierarchical grouping of multiple Marked Content segments into composite phrases, including cross-page spans.
7. The formal XML data format, element definitions, and Document Type Definition (DTD) schema
   (`pdf_phrase_map_1.0.0-schema.dtd`).

---

## 2. File System and Package Architecture

### 2.1. File System Hierarchy (Extension to Section 6.1)
In accordance with Section 6.1 of the Hybrid Book 3.0 specification, all assets of an edition reside within a single
root directory (or its subdirectories). When a PDF text record is utilized, the directory structure is organized
as follows:

- `[edition]/`
  - `book.xml` *(publication metadata and set declarations)*
  - `sync.xml` *(or specific synchronization file, e.g. `video.xml`)*
  - `outline.xml` *(hierarchical navigation outline)*
  - `text/`
    - `[filename].pdf` *(the primary PDF document, e.g. `document.pdf`)*
    - `phrase_map.xml` *(the auxiliary XML phrase mapping file)*
    - `pdf_phrase_map_1.0.0-schema.dtd` *(DTD schema definition)*
  - `video/` *(optional video record files, e.g. `video1.mp4`, `video1.flv`)*
  - `audio/` *(optional audio record files, e.g. `audio1.mp3`, `audio1.aac`)*

The `text/` directory name is strictly determined by the `type="text"` attribute of the corresponding `<media>` element
in the synchronization file (`[sync].xml`). Within `text/`, the PDF file retains its original or configured filename,
and the accompanying phrase map must be named `phrase_map.xml`.

### 2.2. Synchronization Integration (Extension to Section 6.2 and Section 8)
In the synchronization file (`[sync].xml`), the PDF text track is declared within a `<media>` block having
`type="text"` and `format="PDF"`:

```xml
<media type="text" format="PDF" group="video_group">
  <files>
    <file name="document.pdf" from="1" to="142" />
  </files>
</media>
```

The attributes of `<file>` in `[sync].xml` fulfill the following roles:
- `name`: Specifies the filename of the target PDF located within the `text/` directory (e.g., `document.pdf`).
- `from`: The canonical 1-based phrase identifier (`id`) of the first phrase contained in this file (e.g., `"1"`).
- `to`: The canonical 1-based phrase identifier (`id`) of the final phrase contained in this file (e.g., `"142"`).

In HTML-based Hybrid Books, phrase identifiers are embedded directly into markup via `id` attributes (`id="phr:1"`,
`id="phr:2"`). In a PDF-based text record, phrase identifiers are not embedded into the binary PDF. Instead, conforming
Hybrid Book viewing software locates the auxiliary `phrase_map.xml` in the `text/` directory alongside `document.pdf` to
resolve each phrase ID into its corresponding PDF page and Marked Content segment.

---

## 3. PDF Architecture, Marked Content, and Logical Structure

### 3.1. Marked Content in Content Streams (ISO 32000-1 and ISO 32000-2, Clause 14.6)
In the PDF standard (ISO 32000-1 / ISO 32000-2, Clause 14.6 "Marked content"), page content streams delimit marked
content sequences using three primary operators:
1. `BMC` (*Begin Marked Content*): Takes a single tag name operand (`/Tag BMC`). It demarcates a marked content block
   without an associated property list dictionary.
2. `BDC` (*Begin Marked Content with Property List*): Takes a tag name operand and a property list operand
   (`/Tag << /MCID n ... >> BDC` or `/Tag /PropName BDC`). The property list operand is either an inline dictionary or
   a resource name referring to an entry in the `/Properties` subdictionary of the page's `/Resources` dictionary. It
   associates structured metadata, such as a Marked Content Identifier (`/MCID`), structural role keys, or language
   and accessibility attributes, with the enclosed graphic and text operations.
3. `EMC` (*End Marked Content*): Closes the innermost active marked content block.

Marked content sequences may be nested. In Tagged PDF documents, accessibility guidelines and layout generators enclose
meaningful content units (such as headings, paragraphs, table cells, and list items) within `BDC ... EMC` blocks
bearing an `/MCID` integer property that is unique within the scope of that page's content stream.

### 3.2. Logical Structure Hierarchy and the Structure Tree (Clause 14.7 and 14.8)
Beyond content stream operators, the PDF standard defines a document-wide logical structure hierarchy independent of
physical page boundaries (ISO 32000-1 / ISO 32000-2, Clause 14.7 "Logical structure", and Clause 14.8 "Tagged PDF"):

1. **Structure Tree Root (`StructTreeRoot`)**: Located in the document catalog dictionary (`/Root`), the structure
   tree root serves as the apex of the logical hierarchy. It contains the child structure elements (`/K`), the role map
   (`/RoleMap`) mapping custom tags to standard structure types, and the parent tree (`/ParentTree`).
2. **Structure Elements (`StructElem`)**: Nodes in the structure hierarchy representing semantic document components
   (e.g., `/Document`, `/Part`, `/Sect`, `/H1` through `/H6`, `/P`, `/L`, `/LI`, `/Table`, `/Span`).
3. **Representation of Content Items**: A structure element references its constituent content items through its `/K`
   (kids) entry using several standard representations:
   - **Direct Marked-Content Identifier (`MCID`)**: An integer value (or array of integers) corresponding directly to
     the `/MCID` entry in the property list of a `BDC` sequence in the page content stream. The structure element's
     `/Pg` entry specifies the page object containing the content.
   - **Marked-Content Reference Dictionary (`/Type /MCR`)**: An explicit dictionary identifying marked content on a
     page. It contains `/Type /MCR`, `/Pg` (indirect reference to the page object), `/MCID` (integer identifier), and
     optionally `/Stm` (the stream object, used when the marked content resides in a Form XObject or appearance stream).
   - **Object Reference Dictionary (`/Type /OBJR`)**: References an indirect PDF object (such as an annotation or form
     field) via its `/Obj` key, integrating non-stream objects into the logical structure.
   - **Child Structure Elements**: Recursive nesting of child `StructElem` dictionaries to reflect document hierarchy.
4. **Parent Tree (`/ParentTree`)**: A number tree mapping an integer structural parent key (`/StructParents` on a page
   object, or `/StructParent` on an annotation or Form XObject) to an array of indirect references pointing back to the
   `StructElem` dictionaries containing each content item. This enables bidirectional navigation between page content
   streams and the logical structure tree.

Tagged PDF requires that all visible page content be classified either as real content associated with structure
elements or explicitly marked as artifacts (via `/Artifact BMC` or `/Artifact << ... >> BDC`, or via artifact structure
elements) that are ignored during logical reading and synchronization.

### 3.3. Abstract Content Ingestion and Extraction Models
Conforming Hybrid Book systems must ingest and extract text and structural boundaries from PDF documents in a manner
that respects the PDF specification. Processors may employ two complementary paradigms:

1. **Topological Content Stream Traversal**: The processor parses page content streams sequentially in visual and
   drawing order. It tracks marked content scope transitions (`BMC`, `BDC`, `EMC`) and extracts text operators
   (`Tj`, `TJ`, `'`, `"`), concatenating glyph strings into coherent text runs while applying character-level whitespace
   normalization and hyphenation reconciliation.
2. **Logical Structure Tree Traversal**: The processor traverses the document's `StructTreeRoot` down to leaf structure
   elements (`StructElem`). It resolves content items through direct `MCID` values or `MCR` records, reconstructing the
   logical reading order as intended by the document author, regardless of physical content stream sequencing.

Regardless of which ingestion paradigm an implementation uses internally, the resulting extracted segments must be
correlated with the canonical sequential numbering defined by this specification.

### 3.4. Runtime Ephemeral Identifiers versus Canonical Sequential Identifiers
Viewing and rendering environments (including web engines, desktop PDF viewers, and native OS accessibility APIs)
frequently assign internal runtime handles, DOM element IDs, or memory pointers to rendered page elements. These
identifiers are implementation-specific runtime artifacts: they vary across rendering backends, differ across library
versions, and cannot be standardized across different reading software (such as native desktop viewers, mobile players,
or refreshable Braille displays).

Consequently, conforming Hybrid Book systems must never serialize proprietary or runtime-specific identifiers into
persistent document descriptors. Instead, all persistent mapping must use the library-agnostic **Canonical Sequential
Identifier (`sequentialId`)**.

The canonical sequential index is generated by maintaining a global 0-based counter that is incremented sequentially
in the exact topological order of marked content opening delimiters across all pages of the PDF document.

### 3.5. Differential Handling of Property-Bearing (BDC) and Property-Less (BMC) Marked Content
Conforming systems must strictly differentiate between marked content bearing properties and property-less marked
content when establishing the canonical segment sequence:

1. **Handling of Property-Bearing Marked Content (`BDC`)**:
   - Encountering a `BDC` operator (or its structure-tree equivalent referencing a property list with an `/MCID` or
     semantic tag) initiates an active, identifiable marked content scope.
   - The global sequential marker counter is incremented.
   - Text operations enclosed within the `BDC ... EMC` scope are accumulated and normalized.
   - Upon encountering the matching `EMC`:
     - If the marked content scope contained non-empty textual content (excluding whitespace and formatting artifacts),
       an **addressable text segment** is produced.
     - The segment is assigned `sequentialId = counter - 1` (the 0-based index assigned when the scope was opened).
     - The segment records its physical 1-based page number.
     - This segment is eligible to be referenced directly in `phrase_map.xml`.

2. **Handling of Property-Less Marked Content (`BMC`)**:
   - Property-less marked content (`BMC`) lacks a property list dictionary and possesses no `/MCID`. In standard PDF
     authoring, `BMC` is typically employed for visual grouping, graphic clipping delimiters, or unannotated layout
     artifacts.
   - Because it lacks distinct properties and structural metadata, a `BMC` block cannot be uniquely addressed,
     selected, or navigated by external synchronization descriptors.
   - However, upon encountering a `BMC` operator, the global sequential marker counter is **still incremented**.
   - Text enclosed within a property-less `BMC` block is not captured into an addressable segment, preventing orphan
     or unidentifiable segments from polluting the phrase map.

**Normative Rationale for Topological Sequence Counter Synchronization**:
Advancing the sequential counter on every marked content opening delimiter—both `BDC` and `BMC`—is essential for
universal interoperability. In raw PDF content streams, both `BDC` and `BMC` constitute valid, syntactically identical
structural delimiters. If the counter skipped `BMC` operators, external parsers operating directly on content streams
without access to high-level semantic filtering would produce divergent index sequences whenever property-less blocks
occur. By defining the canonical index over all topological marked content open events, all conforming implementations
are guaranteed to compute identical, deterministic sequential IDs across the entire publication.

---

## 4. Segment Hierarchy, Compound Phrases, and Synchronization Harmonization

### 4.1. Conceptual Data Model for Text Segments
In the abstract Hybrid Book processing model, an extracted text unit is characterized by the following conceptual
properties:
- **Canonical Sequential Identifier (`sequentialId`)**: A non-negative integer indicating the segment's 0-based
  topological occurrence in the document's marked content sequence.
- **Page Number (`page`)**: The 1-based physical page number on which the segment resides.
- **Normalized Text (`text`)**: The plain-text string extracted from the enclosed glyph runs, normalized with proper
  word boundaries and whitespace spacing.
- **Synchronization Eligibility**: An indicator of whether the segment represents synchronized narrative content or an
  excluded non-content artifact.
- **Hierarchical Phrase Association**: The association linking the segment to a parent synchronization phrase,
  either as the primary anchor segment or as an ordered continuation segment.

### 4.2. Compound Phrases and Segment Grouping
In published literature and educational textbooks, a single logical sentence, paragraph, heading, or stanza often spans
multiple Marked Content blocks due to typographical formatting changes (such as bold, italic, or font switches), drop
caps, mathematical expressions, or multi-column layout breaks. Furthermore, as established in Section 5.3.4 of the
Hybrid Book 3.0 specification, synchronization with video sign language often requires coarser phrase granularity than
fine-grained typographic markup.

To accommodate this, the format supports **segment grouping into compound phrases**:
- A primary segment serves as the initial anchor for the phrase.
- Subsequent contiguous segments are grouped under the phrase as continuation segments.
- All enclosed text from the primary and continuation segments forms a single logical synchronization phrase.
- In `phrase_map.xml`, the phrase contains multiple `<segment>` elements listed in reading order.
- Conforming viewing software highlighting an active phrase highlights all constituent segments simultaneously on the
  rendered page.

### 4.3. Cross-Page Phrase Continuity
In typesetting, paragraphs and sentences routinely cross page boundaries. In the Hybrid Book PDF phrase map, a single
logical phrase may span across pages:
- The parent `<phrase>` element declares the primary anchor page (the page where the phrase begins).
- The primary `<segment>` specifies its page (e.g., page 4).
- Continuation `<segment>` elements specify their actual page (e.g., page 5).

### 4.4. Content Filtering, Non-Content Artifacts, and Phrase Harmonization
Publications contain non-synchronizable elements, such as running page headers, running footers, page numbering,
printer crop marks, decorative ornaments, and publisher legal disclaimers. In PDF, these are frequently marked with
`/Artifact` tags or enclosed in property-less `BMC` blocks.

In audio and video sign language synchronization, such elements must not be voiced or signed, and must not create
unwanted pauses or empty synchronization intervals:
- Non-content segments are excluded from synchronization and are completely omitted from `phrase_map.xml`.
- Excluded segments do not consume phrase IDs, ensuring that phrase numbering in `phrase_map.xml` remains strictly
  contiguous and aligned with `[sync].xml`.
- When filtering removes non-content segments that occur adjacent to or between narrative blocks, remaining content
  segments are harmonized to maintain uninterrupted, logical phrase groupings.

---

## 5. Phrase Map Data Specification (XML Structure and DTD)

This chapter defines the technical data structure of the PDF phrase map file (`phrase_map.xml`).

### 5.1. Structure of Phrase Map Data Based on DTD Specification
Phrase map data is recorded in a text file formatted in XML according to the accompanying DTD schema. The file is
located in the `text/` subdirectory of the edition alongside the PDF document.

**File Information**
- **name:** `phrase_map.xml`
- **type:** XML version 1.0
- **location:** `text/` subdirectory
- **content type:** synchronization and navigation mapping metadata

**Description**
The phrase map provides the authoritative mapping between the publication's logical synchronization units (phrases)
and the internal physical structure of the PDF document (page numbers and Canonical Sequential Identifiers (`sequentialId`)s).

#### 5.1.1. Header
The file `phrase_map.xml` conforms to XML version 1.0 in UTF-8 encoding. The document header has the standard form:
```xml
<?xml version="1.0" encoding="utf-8"?>
```

#### 5.1.2. Doctype
Elements used in `phrase_map.xml` are governed by the DTD schema `pdf_phrase_map_1.0.0-schema.dtd`. In accordance with
the document type declaration conventions across Hybrid Book 3.0 descriptor files (such as `book.xml` and `sync.xml`),
the header must include the following declaration:
```xml
<!DOCTYPE book SYSTEM "pdf_phrase_map_1.0.0-schema.dtd">
```

### 5.2. Structure and Elements of `phrase_map.xml`

```text
phrase_map (root element)
  phrase (describes the mapping of a single phrase)
    segment (references a specific PDF Marked Content item)
```

#### 5.2.1. Element `phrase_map`
- **Name:** `phrase_map`
- **Syntax:** `<phrase_map file="..."> ... </phrase_map>`
- **Contained in:** - (root element)
- **Contains:** 0 or more `phrase` elements
- **Attributes:**

| Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `file` | CDATA | Yes | Specifies the filename of the referenced PDF document |

**Description:**
The `phrase_map` element is the root element of the mapping descriptor. It binds all contained phrase definitions
to the specified PDF document file residing in the same `text/` directory.

#### 5.2.2. Element `phrase`
- **Name:** `phrase`
- **Syntax:** `<phrase id="..." page="..."> ... </phrase>`
- **Contained in:** `phrase_map`
- **Contains:** 1 or more `segment` elements
- **Attributes:**

| Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | CDATA | Yes | Canonical 1-based phrase identifier matching `[sync].xml` |
| `page` | CDATA | Yes | 1-based page number of the primary phrase anchor in the PDF |

**Description:**
The `phrase` element describes a single synchronization and navigation unit. The value of the `id` attribute strictly
corresponds to the `id` attribute of the `phrase` elements in `[sync].xml` across all parallel media tracks (audio,
video sign language, outline). The `page` attribute designates the primary page on which the phrase starts or is
anchored. A phrase must contain at least one `segment` element representing the primary text block, and may contain
additional `segment` elements representing linked continuation blocks.

#### 5.2.3. Element `segment`
- **Name:** `segment`
- **Syntax:** `<segment id="..." page="..." />`
- **Contained in:** `phrase`
- **Contains:** - (empty element)
- **Attributes:**

| Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | CDATA | Yes | 0-based sequential Marked Content identifier (Canonical Sequential Identifier (`sequentialId`)) |
| `page` | CDATA | Yes | 1-based page number where the Marked Content item resides |

**Description:**
The `segment` element identifies an individual atomic Marked Content block within the PDF document. Its `id` attribute
holds the canonical 0-based sequential ID computed during document traversal, and its `page` attribute specifies the
exact page on which this segment is located.

### 5.3. Attributes of `phrase_map.xml`

#### 5.3.1. Attribute `file`
- **Syntax:** `file="[value]"`
- **Type:** `#REQUIRED`
- **Contained in:** `phrase_map`
- **Values:** `CDATA` (filename of the PDF file, e.g. `"document.pdf"`)

**Description:**
The value of the `file` attribute specifies the name of the PDF document described by this phrase map. The target file
must exist within the same `text/` directory.

#### 5.3.2. Attribute `id` (on `phrase`)
- **Syntax:** `id="[value]"`
- **Type:** `#REQUIRED`
- **Contained in:** `phrase`
- **Values:** `CDATA` (positive integer string, e.g. `"1"`, `"2"`, `"3"`)

**Description:**
The `id` attribute defines the unique canonical identifier of the phrase within the publication. It matches the `id`
used in `[sync].xml` and `outline.xml`. Every phrase in `phrase_map.xml` must have a unique identifier, numbered
monotonically ascending from $1$ to $N$.

#### 5.3.3. Attribute `page` (on `phrase`)
- **Syntax:** `page="[value]"`
- **Type:** `#REQUIRED`
- **Contained in:** `phrase`
- **Values:** `CDATA` (positive integer string, e.g. `"1"`, `"24"`)

**Description:**
The `page` attribute specifies the primary 1-based page number where the phrase begins. When a reader navigates to this
phrase via the outline or player controls, the PDF viewer automatically navigates to this page.

#### 5.3.4. Attribute `id` (on `segment`)
- **Syntax:** `id="[value]"`
- **Type:** `#REQUIRED`
- **Contained in:** `segment`
- **Values:** `CDATA` (non-negative integer string, e.g. `"0"`, `"1"`, `"15"`)

**Description:**
The `id` attribute specifies the canonical 0-based sequential Marked Content index (sequentialId). It uniquely identifies the marked
content item in document reading order.

#### 5.3.5. Attribute `page` (on `segment`)
- **Syntax:** `page="[value]"`
- **Type:** `#REQUIRED`
- **Contained in:** `segment`
- **Values:** `CDATA` (positive integer string, e.g. `"1"`, `"25"`)

**Description:**
The `page` attribute specifies the 1-based page number containing the specific Marked Content item. For single-page
phrases, this matches the parent `phrase` page; for phrases that cross a page boundary, continuation segments reference
subsequent page numbers.

### 5.4. Complete XML Examples

#### 5.4.1. Standard Linear 1-to-1 Mapping
In a simple text record where each paragraph or heading corresponds directly to a single Marked Content item:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE book SYSTEM "pdf_phrase_map_1.0.0-schema.dtd">
<phrase_map file="chapter1.pdf">
  <phrase id="1" page="1">
    <segment id="0" page="1" />
  </phrase>
  <phrase id="2" page="1">
    <segment id="1" page="1" />
  </phrase>
  <phrase id="3" page="1">
    <segment id="2" page="1" />
  </phrase>
</phrase_map>
```

#### 5.4.2. Composite and Cross-Page Linked Phrases
In this example:
- Phrase 1 is an atomic title segment on page 1.
- Phrase 2 is a compound paragraph on page 1 formed by linking two segments (segments 1 and 2).
- Phrase 3 is a paragraph that begins near the bottom of page 1 (segment 3) and continues onto page 2 (segment 4).
- Note that non-content segments (such as page headers or footers) were excluded during segmentation and therefore
  do not appear in the mapping.

```xml
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE book SYSTEM "pdf_phrase_map_1.0.0-schema.dtd">
<phrase_map file="complete_work.pdf">
  <phrase id="1" page="1">
    <segment id="0" page="1" />
  </phrase>
  <phrase id="2" page="1">
    <segment id="1" page="1" />
    <segment id="2" page="1" />
  </phrase>
  <phrase id="3" page="1">
    <segment id="3" page="1" />
    <segment id="4" page="2" />
  </phrase>
  <phrase id="4" page="2">
    <segment id="6" page="2" />
  </phrase>
</phrase_map>
```

### 5.5. Formal DTD Schema (`pdf_phrase_map_1.0.0-schema.dtd`)
The full Document Type Definition schema governing `phrase_map.xml` is defined as follows:

```dtd
<!--
  Hybrid Book 3.0 - PDF Phrase Map Schema
  Version: 1.0.0
  Description:
    Document Type Definition (DTD) for the PDF phrase mapping descriptor
    accompanying a PDF text record in a Hybrid Book 3.0 publication.
    Maps canonical navigation and synchronization phrase IDs to PDF pages
    and sequential Marked Content identifiers.
-->

<!-- Root element of the phrase map -->
<!ELEMENT phrase_map (phrase*)>
<!ATTLIST phrase_map
  file CDATA #REQUIRED
>

<!-- Phrase element: maps a canonical phrase ID to one or more marked content segments -->
<!ELEMENT phrase (segment+)>
<!ATTLIST phrase
  id CDATA #REQUIRED
  page CDATA #REQUIRED
>

<!-- Segment element: identifies a specific PDF marked content occurrence on a page -->
<!ELEMENT segment EMPTY>
<!ATTLIST segment
  id CDATA #REQUIRED
  page CDATA #REQUIRED
>

<!-- Compatibility declaration for standard Hybrid Book DOCTYPE book declaration -->
<!ELEMENT book (phrase_map*)>
```
