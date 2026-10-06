/**
 * Attribute dictionary for XML element nodes.
 */
export type XmlAttributes = Record<string, string | number | boolean | null | undefined>;

/**
 * Escapes XML-reserved characters in text or attribute values.
 *
 * @param text The raw string to escape.
 * @returns The XML-safe escaped string.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wraps content in an XML CDATA section.
 *
 * @param content The text to enclose.
 * @returns The CDATA section string.
 */
export function createCdata(content: string): string {
  return `<![CDATA[${content.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * Represents a single XML node in an XML document tree.
 */
export class XmlElement {
  public readonly name: string;
  public readonly attributes: XmlAttributes;
  public readonly children: (XmlElement | string)[];
  public readonly isCdata: boolean;

  /**
   * Constructs an XmlElement.
   *
   * @param name The element tag name.
   * @param attributes Optional attribute key-value pairs.
   * @param children Optional list of child elements or string content.
   * @param isCdata Whether string children should be rendered as CDATA.
   */
  constructor(
    name: string,
    attributes: XmlAttributes = {},
    children: (XmlElement | string)[] = [],
    isCdata = false
  ) {
    this.name = name;
    this.attributes = attributes;
    this.children = children;
    this.isCdata = isCdata;
  }

  /**
   * Adds a child element or string to this node.
   *
   * @param child The child element or string.
   * @returns This element instance for fluent chaining.
   */
  public addChild(child: XmlElement | string): this {
    this.children.push(child);
    return this;
  }

  /**
   * Renders this element and its descendants into an XML string.
   *
   * @param indentLevel The indentation nesting level.
   * @param indentSpaces Number of spaces per indentation level.
   * @returns The formatted XML string.
   */
  public toXmlString(indentLevel = 0, indentSpaces = 2): string {
    const indent = ' '.repeat(indentLevel * indentSpaces);
    const attrString = this.formatAttributes();
    const tagOpen = attrString.length > 0 ? `<${this.name} ${attrString}>` : `<${this.name}>`;
    const tagClose = `</${this.name}>`;

    if (this.children.length === 0) {
      return attrString.length > 0
        ? `${indent}<${this.name} ${attrString} />`
        : `${indent}<${this.name} />`;
    }

    const hasElementChildren = this.children.some((child) => child instanceof XmlElement);

    if (!hasElementChildren) {
      const textContent = this.children
        .map((child) => {
          const str = String(child);
          return this.isCdata ? createCdata(str) : escapeXml(str);
        })
        .join('');
      return `${indent}${tagOpen}${textContent}${tagClose}`;
    }

    const childStrings = this.children.map((child) => {
      if (child instanceof XmlElement) {
        return child.toXmlString(indentLevel + 1, indentSpaces);
      }
      const childIndent = ' '.repeat((indentLevel + 1) * indentSpaces);
      const str = String(child);
      const formattedText = this.isCdata ? createCdata(str) : escapeXml(str);
      return `${childIndent}${formattedText}`;
    });

    return `${indent}${tagOpen}\n${childStrings.join('\n')}\n${indent}${tagClose}`;
  }

  /**
   * Serializes element attributes into key="value" strings.
   *
   * @returns The serialized attribute string.
   */
  private formatAttributes(): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(this.attributes)) {
      if (value !== null && value !== undefined) {
        parts.push(`${key}="${escapeXml(String(value))}"`);
      }
    }
    return parts.join(' ');
  }
}

/**
 * Configuration options for an XML document.
 */
export interface XmlDocumentOptions {
  doctype?: string,
  indentSpaces?: number,
}

/**
 * Represents a complete XML document with header and DOCTYPE.
 */
export class XmlDocument {
  public root: XmlElement;
  public doctype?: string;
  public indentSpaces: number;

  /**
   * Constructs an XmlDocument.
   *
   * @param root The root XmlElement.
   * @param options Optional DOCTYPE and indentation settings.
   */
  constructor(root: XmlElement, options?: XmlDocumentOptions) {
    this.root = root;
    this.doctype = options?.doctype;
    this.indentSpaces = options?.indentSpaces ?? 2;
  }

  /**
   * Serializes the document to an XML string with declaration.
   *
   * @returns The complete XML document string.
   */
  public toString(): string {
    const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];
    
    if (this.doctype) {
      lines.push(this.doctype);
    }
    
    lines.push(this.root.toXmlString(0, this.indentSpaces));
    
    return lines.join('\n');
  }
}
