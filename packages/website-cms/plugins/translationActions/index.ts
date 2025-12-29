import {definePlugin} from 'sanity'
import {translateEnToJa} from './translateEnToJa'
import {translateJaToEn} from './translateJaToEn'

export const translationActions = definePlugin({
  name: 'translation-actions',
  document: {
    actions: (prev, context) => {
      // Only add translation actions for 'entry' documents
      if (context.schemaType !== 'entry') {
        return prev
      }

      return [...prev, translateEnToJa, translateJaToEn]
    },
  },
})
