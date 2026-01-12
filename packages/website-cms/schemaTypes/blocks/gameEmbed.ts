import {defineType, defineField} from 'sanity'
import {PlayIcon} from '@sanity/icons'

export default defineType({
  name: 'gameEmbed',
  title: 'Game Embed',
  type: 'object',
  icon: PlayIcon,
  fields: [
    defineField({
      name: 'gameSlug',
      type: 'string',
      title: 'Game Slug',
      description: 'Name of the game project (e.g., "roguelike", "week1-game")',
      validation: (Rule) => Rule.required(),
      placeholder: 'roguelike',
    }),
    defineField({
      name: 'title',
      type: 'string',
      title: 'Title',
      description: 'Title for the game embed (aspect ratio is automatically detected from the game)',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      slug: 'gameSlug',
    },
    prepare({title, slug}) {
      return {
        title: title || 'Game Embed',
        subtitle: slug ? `/projects/${slug}/` : 'No game selected',
        media: PlayIcon,
      }
    },
  },
})
