import { describe, it, expect } from 'vitest';
import { escapeXml, createCdata, XmlElement, XmlDocument } from './xml-builder';

describe('xml-builder', () => {
  describe('escapeXml', () => {
    it('should escape special XML characters', () => {
      expect(escapeXml('Tom & Jerry <test> "quotes" \'apos\'')).toBe(
        'Tom &amp; Jerry &lt;test&gt; &quot;quotes&quot; &apos;apos&apos;'
      );
    });

    it('should leave normal strings unchanged', () => {
      expect(escapeXml('normal string 123')).toBe('normal string 123');
    });
  });

  describe('createCdata', () => {
    it('should wrap text in CDATA block', () => {
      expect(createCdata('Chapter 1: The Beginning')).toBe('<![CDATA[Chapter 1: The Beginning]]>');
    });

    it('should safely escape embedded CDATA terminators', () => {
      expect(createCdata('content with ]]> inside')).toBe('<![CDATA[content with ]]]]><![CDATA[> inside]]>');
    });
  });

  describe('XmlElement', () => {
    it('should render a self-closing element when it has no children', () => {
      const el = new XmlElement('sync', { file: 'video.xml' });
      expect(el.toXmlString()).toBe('<sync file="video.xml" />');
    });

    it('should render a self-closing tag without attributes', () => {
      const el = new XmlElement('test');
      expect(el.toXmlString()).toBe('<test />');
    });

    it('should render an element with simple text child on one line', () => {
      const el = new XmlElement('version', {}, ['3.0.5']);
      expect(el.toXmlString()).toBe('<version>3.0.5</version>');
    });

    it('should render an element with CDATA content on one line', () => {
      const el = new XmlElement('text', {}, ['Dějiny filozofie'], true);
      expect(el.toXmlString()).toBe('<text><![CDATA[Dějiny filozofie]]></text>');
    });

    it('should render nested elements with 2-space indentation', () => {
      const root = new XmlElement('outline');
      const item = new XmlElement('item');
      item.addChild(new XmlElement('id', {}, ['1']));
      item.addChild(new XmlElement('level', {}, ['1']));
      root.addChild(item);

      const expected = [
        '<outline>',
        '  <item>',
        '    <id>1</id>',
        '    <level>1</level>',
        '  </item>',
        '</outline>',
      ].join('\n');

      expect(root.toXmlString()).toBe(expected);
    });

    it('should skip null and undefined attributes', () => {
      const el = new XmlElement('file', { name: 'test.mp4', from: 1, to: undefined, other: null });
      expect(el.toXmlString()).toBe('<file name="test.mp4" from="1" />');
    });
  });

  describe('XmlDocument', () => {
    it('should serialize a complete XML document with header and DOCTYPE', () => {
      const root = new XmlElement('book');
      root.addChild(new XmlElement('version', {}, ['3.0.5']));

      const doc = new XmlDocument(root, {
        doctype: '<!DOCTYPE book SYSTEM "book_3.0.05-schema.dtd">',
      });

      const expected = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!DOCTYPE book SYSTEM "book_3.0.05-schema.dtd">',
        '<book>',
        '  <version>3.0.5</version>',
        '</book>',
      ].join('\n');

      expect(doc.toString()).toBe(expected);
    });

    it('should serialize a document without DOCTYPE', () => {
      const root = new XmlElement('phrase_map', { file: 'doc.pdf' });
      const doc = new XmlDocument(root);

      const expected = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<phrase_map file="doc.pdf" />',
      ].join('\n');

      expect(doc.toString()).toBe(expected);
    });
  });
});
