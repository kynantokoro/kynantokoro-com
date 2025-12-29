import {defineType, defineField} from 'sanity'
import {PlayIcon} from '@sanity/icons'

export default defineType({
  name: 'audioPlayer',
  title: 'Audio Player',
  type: 'object',
  icon: PlayIcon,
  fields: [
    defineField({
      name: 'audioUrl',
      type: 'url',
      title: 'Audio URL',
      description: 'URL for the audio file',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      type: 'string',
      title: 'Title',
      description: 'Title for the audio track',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      url: 'audioUrl',
    },
    prepare({title, url}) {
      return {
        title: title || 'Audio Player',
        subtitle: url,
        media: PlayIcon,
      }
    },
  },
})
