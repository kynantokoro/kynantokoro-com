import {defineField, defineType, defineArrayMember} from 'sanity'
import {ImageSeedInput} from '../components/ImageSeedInput'

export default defineType({
  name: 'entry',
  type: 'document',
  title: 'Entry',
  fields: [
    // Entry type selector
    defineField({
      name: 'entryType',
      type: 'string',
      title: 'Type',
      options: {
        list: [
          {title: 'Weekly Project', value: 'weekly-project'},
          {title: 'Blog Post', value: 'blog'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),

    // Common fields
    defineField({
      name: 'slug',
      type: 'slug',
      title: 'Slug',
      description: 'URL-friendly identifier. Examples: "week-01", "hello-world", "my-first-game"',
      options: {
        source: 'title.en',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      type: 'object',
      title: 'Title',
      fields: [
        defineField({name: 'en', type: 'string', title: 'English'}),
        defineField({name: 'ja', type: 'string', title: 'Japanese'}),
      ],
      validation: (Rule) =>
        Rule.custom((title) => {
          if (!title?.en && !title?.ja) {
            return 'At least one language title is required'
          }
          return true
        }),
    }),
    defineField({
      name: 'date',
      type: 'date',
      title: 'Date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'imageSeed',
      type: 'number',
      title: 'Key Image Seed',
      description: 'Seed for generating key image from DSANIM frames (0-9999)',
      validation: (Rule) => Rule.min(0).max(9999).integer(),
      initialValue: () => Math.floor(Math.random() * 10000),
      components: {
        input: ImageSeedInput,
      },
    }),
    defineField({
      name: 'tags',
      type: 'array',
      title: 'Tags',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'content',
      type: 'object',
      title: 'Content',
      fields: [
        defineField({
          name: 'en',
          type: 'array',
          title: 'English Content',
          of: [
            defineArrayMember({type: 'block'}),
            defineArrayMember({type: 'image'}),
            defineArrayMember({type: 'gameEmbed'}),
            defineArrayMember({type: 'audioPlayer'}),
          ],
        }),
        defineField({
          name: 'ja',
          type: 'array',
          title: 'Japanese Content',
          of: [
            defineArrayMember({type: 'block'}),
            defineArrayMember({type: 'image'}),
            defineArrayMember({type: 'gameEmbed'}),
            defineArrayMember({type: 'audioPlayer'}),
          ],
        }),
      ],
    }),

    // Weekly Project-specific fields (hidden for blog posts)
    defineField({
      name: 'week',
      type: 'number',
      title: 'Week Number',
      description: 'The week number for this Weekly Project entry. Examples: 1, 2, 3, etc.',
      placeholder: '1',
      hidden: ({document}) => document?.entryType !== 'weekly-project',
      validation: (Rule) =>
        Rule.custom((week, context) => {
          if (context.document?.entryType === 'weekly-project' && !week) {
            return 'Week number is required for Weekly Project entries'
          }
          return true
        }),
    }),

    // Translation flags
    defineField({
      name: 'enIsTranslated',
      type: 'boolean',
      title: 'English is Machine Translated',
      description: 'Indicates that the English content was machine-translated from Japanese',
      initialValue: false,
    }),
    defineField({
      name: 'jaIsTranslated',
      type: 'boolean',
      title: 'Japanese is Machine Translated',
      description: 'Indicates that the Japanese content was machine-translated from English',
      initialValue: false,
    }),
  ],

  preview: {
    select: {
      titleEn: 'title.en',
      titleJa: 'title.ja',
      entryType: 'entryType',
      week: 'week',
      date: 'date',
    },
    prepare({titleEn, titleJa, entryType, week, date}) {
      const title = titleEn || titleJa || 'Untitled'
      const subtitle =
        entryType === 'weekly-project'
          ? `Weekly Project Week ${week} • ${date}`
          : `Blog • ${date}`
      return {
        title,
        subtitle,
      }
    },
  },
})
