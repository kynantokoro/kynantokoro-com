import {NumberInputProps, set, unset} from 'sanity'
import {Stack, TextInput, Card, Flex, Text} from '@sanity/ui'
import {useCallback} from 'react'

export function EmojiNumberInput(props: NumberInputProps) {
  const {elementProps, onChange, value = 1} = props

  const handleChange = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value
      const numValue = nextValue === '' ? undefined : parseInt(nextValue, 10)

      if (numValue === undefined) {
        onChange(unset())
      } else if (numValue >= 1 && numValue <= 323) {
        onChange(set(numValue))
      }
    },
    [onChange],
  )

  const emojiNumber = typeof value === 'number' ? value : 1

  return (
    <Stack space={3}>
      <Flex gap={3} align="center">
        {/* Number input */}
        <TextInput
          {...elementProps}
          type="number"
          min={1}
          max={323}
          value={value || ''}
          onChange={handleChange}
          placeholder="1-323"
          style={{width: '120px'}}
        />

        {/* Emoji preview */}
        <Card
          padding={2}
          radius={2}
          shadow={1}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
          }}
        >
          <img
            src={`/static/emojis/Emojis_32x32_${emojiNumber}.png`}
            alt={`Emoji ${emojiNumber}`}
            style={{
              width: '48px',
              height: '48px',
              imageRendering: 'pixelated',
            }}
          />
        </Card>

        {/* Emoji number label */}
        <Text size={1} muted>
          #{emojiNumber}
        </Text>
      </Flex>

      {/* Helper text */}
      <Text size={1} muted>
        Choose a number between 1 and 323 to select an emoji
      </Text>
    </Stack>
  )
}
