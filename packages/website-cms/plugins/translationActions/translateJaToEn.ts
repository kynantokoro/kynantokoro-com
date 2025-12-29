import {DocumentActionComponent, useClient} from 'sanity'
import {useToast} from '@sanity/ui'
import {TranslateIcon} from '@sanity/icons'
import type {PortableTextBlock} from '@portabletext/types'
import {serializePortableText, parsePortableText} from './portableTextUtils'

// Type for the entry document
interface EntryDocument {
  content?: {
    en?: PortableTextBlock[]
    ja?: PortableTextBlock[]
  }
  title?: {
    en?: string
    ja?: string
  }
}

export const translateJaToEn: DocumentActionComponent = (props) => {
  const {draft, published, id} = props
  const doc = (draft || published) as EntryDocument | undefined
  const client = useClient({apiVersion: '2023-05-03'})
  const toast = useToast()

  return {
    label: 'Translate JA → EN',
    icon: TranslateIcon,
    disabled: !doc?.content?.ja || !doc?.title?.ja,
    onHandle: async () => {
      const jaContentBlocks = doc?.content?.ja
      const jaTitle = doc?.title?.ja

      if (!jaContentBlocks || !jaTitle) {
        toast.push({
          status: 'error',
          title: 'Translation Error',
          description: 'Japanese content is required for translation',
        })
        return
      }

      try {
        // Serialize Portable Text to JSON
        const jaContentJson = serializePortableText(jaContentBlocks)

        if (!jaContentJson || jaContentJson === '[]') {
          toast.push({
            status: 'error',
            title: 'Translation Error',
            description: 'Japanese content is empty',
          })
          return
        }

        // Get translation API endpoint from environment
        // Sanity Studio v3 uses SANITY_STUDIO_ prefix and exposes as process.env
        console.log('process.env.SANITY_STUDIO_TRANSLATION_API_URL:', process.env.SANITY_STUDIO_TRANSLATION_API_URL)
        const apiEndpoint = process.env.SANITY_STUDIO_TRANSLATION_API_URL
        console.log('API Endpoint:', apiEndpoint)

        // Get Sanity authentication token
        const sanityToken = client.config().token

        if (!apiEndpoint) {
          toast.push({
            status: 'error',
            title: 'Configuration Error',
            description: 'Translation API endpoint is not configured',
          })
          return
        }

        if (!sanityToken) {
          toast.push({
            status: 'error',
            title: 'Authentication Error',
            description: 'You must be logged in to Sanity Studio to translate',
          })
          return
        }

        toast.push({
          status: 'info',
          title: 'Translating...',
          description: 'Claude is translating your content to English',
        })

        // Call translation API worker with Sanity token for authentication
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sanityToken}`,
          },
          body: JSON.stringify({
            sourceLanguage: 'Japanese',
            targetLanguage: 'English',
            title: jaTitle,
            content: jaContentJson,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Translation API request failed')
        }

        const result = await response.json()
        console.log('Translation API response:', result)

        const enTitle = result.title
        const enContentJson = result.content
        console.log('Extracted title:', enTitle)
        console.log('Extracted content JSON:', enContentJson)

        // Parse the translated Portable Text JSON
        const enContent = parsePortableText(enContentJson)

        // Update document via Sanity client mutation
        // Always work with draft - create if it doesn't exist
        const draftId = `drafts.${id}`
        console.log('Target draft ID:', draftId)

        if (!draft && published) {
          // Create draft from published document if it doesn't exist
          console.log('Creating draft from published document...')
          await client.createIfNotExists({
            ...published,
            _id: draftId,
          })
        }

        // Patch the draft
        const patchResult = await client
          .patch(draftId)
          .set({
            'title.en': enTitle,
            'content.en': enContent,
            enIsTranslated: true,
          })
          .commit()

        console.log('Patch result:', patchResult)

        toast.push({
          status: 'success',
          title: 'Translation Complete',
          description: 'English content has been generated',
        })

        props.onComplete()
      } catch (error) {
        toast.push({
          status: 'error',
          title: 'Translation Failed',
          description: (error as Error).message,
        })
      }
    },
  }
}
