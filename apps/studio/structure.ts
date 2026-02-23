import {StructureBuilder} from 'sanity/structure'

const SINGLETON_TYPES = new Set(['siteSettings', 'about'])

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

      S.divider(),

      // Collections
      S.documentTypeListItem('book').title('Books'),
      S.documentTypeListItem('blogPost').title('Blog Posts'),
      S.documentTypeListItem('newsItem').title('News'),

      // Optional: expose everything else (handy during development)
      // S.divider(),
      // ...S.documentTypeListItems().filter((item) => {
      //   const id = item.getId()
      //   return id ? !SINGLETON_TYPES.has(id) : true
      // }),
    ])