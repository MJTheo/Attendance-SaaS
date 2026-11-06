// 24-hour "HH:MM" text input, like every other time in the app (a native
// time input would follow the browser's locale and show "06:10 PM").
export const TIME_INPUT = {
  type: 'text',
  inputMode: 'numeric',
  placeholder: 'HH:MM',
  pattern: '([01][0-9]|2[0-3]):[0-5][0-9]',
  title: '24-hour time, e.g. 18:10',
  maxLength: 5,
} as const
