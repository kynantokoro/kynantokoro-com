import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {jaJPLocale} from '@sanity/locale-ja-jp'
import {schemaTypes} from './schemaTypes'
import {translationActions} from './plugins/translationActions'

// Define translation API URL with fallback
export const translationApiUrl = process.env.SANITY_STUDIO_TRANSLATION_API_URL || 'https://kynantokoro.com/translate'

export default defineConfig({
  name: 'default',
  title: 'kynantokoro.com',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'mnezu18w',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [structureTool(), visionTool(), jaJPLocale(), translationActions()],

  schema: {
    types: schemaTypes,
  },
})
