import {NumberInputProps, set, unset} from 'sanity'
import {Stack, TextInput, Button, Flex, Text} from '@sanity/ui'
import {useCallback} from 'react'
import {RefreshIcon} from '@sanity/icons'

export function ImageSeedInput(props: NumberInputProps) {
  const {elementProps, onChange, value = 0} = props

  const handleChange = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value
      const numValue = nextValue === '' ? undefined : parseInt(nextValue, 10)

      if (numValue === undefined) {
        onChange(unset())
      } else if (numValue >= 0 && numValue <= 9999) {
        onChange(set(numValue))
      }
    },
    [onChange],
  )

  const handleRandomize = useCallback(() => {
    const randomSeed = Math.floor(Math.random() * 10000)
    onChange(set(randomSeed))
  }, [onChange])

  const seedValue = typeof value === 'number' ? value : 0

  return (
    <Stack space={3}>
      <Flex gap={2} align="center">
        {/* Number input */}
        <TextInput
          {...elementProps}
          type="number"
          min={0}
          max={9999}
          value={value ?? ''}
          onChange={handleChange}
          placeholder="0-9999"
          style={{width: '120px'}}
        />

        {/* Dice button */}
        <Button
          mode="ghost"
          icon={RefreshIcon}
          onClick={handleRandomize}
          tone="primary"
          text="Random"
        />

        {/* Seed number label */}
        <Text size={1} muted>
          Seed: {seedValue}
        </Text>
      </Flex>

      {/* Helper text */}
      <Text size={1} muted>
        Seed for generating key image (0-9999). Click "Random" to generate a new random seed.
      </Text>
    </Stack>
  )
}
