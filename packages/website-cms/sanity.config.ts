import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {jaJPLocale} from '@sanity/locale-ja-jp'
import {schemaTypes} from './schemaTypes'
import {translationActions} from './plugins/translationActions'

export default defineConfig({
  name: 'default',
  title: 'kynantokoro.com',

  projectId: process.env.SANITY_PROJECT_ID || 'mnezu18w',
  dataset: process.env.SANITY_DATASET || 'production',

  plugins: [structureTool(), visionTool(), jaJPLocale(), translationActions()],

  schema: {
    types: schemaTypes,
  },
})
