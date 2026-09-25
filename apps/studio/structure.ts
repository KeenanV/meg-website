import {StructureBuilder} from 'sanity/structure'

export const structure = (S: StructureBuilder) =>
    S.list()
    .title("Meg's Studio")
    .items([
      // Singletons
      S.listItem()
      .title('Site Settings')
      .id('siteSettings')
      .child(
          S.document()
          .schemaType('siteSettings')
          .documentId('siteSettings')
          .title('Site Settings')
      ),

      S.listItem()
      .title('About')
      .id('about')
      .child(
          S.document()
          .schemaType('about')
          .documentId('about')
          .title('About')
      ),

      S.listItem()
      .title('Links Page')
      .id('linksPage')
      .child(
          S.document()
          .schemaType('linksPage')
          .documentId('linksPage')
          .title('Links Page')
      ),

      S.divider(),

      // Collections
      S.documentTypeListItem('book').title('Books'),
      S.documentTypeListItem('blogPost').title('Blog Posts'),
      S.documentTypeListItem('newsItem').title('News'),

    ])
