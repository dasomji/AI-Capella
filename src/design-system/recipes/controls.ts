import { normalizeRecipe } from './normalize';
/** Pure, literal Tailwind recipes. Each property owns disjoint CSS properties. */
export const controlBase = 'tw:box-border tw:m-0 tw:focus-visible:outline-solid tw:focus-visible:outline-2 tw:focus-visible:outline-focus tw:focus-visible:outline-offset-4 tw:disabled:cursor-default tw:aria-disabled:cursor-wait tw:motion-reduce:transition-none';
export const disabledRecipe = 'tw:disabled:opacity-(--ds-opacity-disabled) tw:aria-disabled:opacity-(--ds-opacity-disabled)';
const denseDisabled = 'tw:disabled:opacity-(--ds-opacity-disabled-admin) tw:aria-disabled:opacity-(--ds-opacity-disabled-admin)';
export const buttonVariants = ['standard', 'cta', 'pill', 'tour', 'dense', 'link'] as const;
export type ButtonVariant = typeof buttonVariants[number];
export type ButtonIntent = 'secondary' | 'primary' | 'danger' | 'quiet';
export interface ButtonOptions { variant?: ButtonVariant; intent?: ButtonIntent; pressed?: boolean }
const buttonShapes: Record<ButtonVariant, string> = {
  standard: 'tw:min-h-control-height tw:rounded-card tw:px-18 tw:py-0 tw:text-button tw:font-label tw:font-control',
  cta: 'tw:min-h-control-height-auth tw:rounded-card tw:px-18 tw:py-0 tw:w-full tw:text-button tw:font-label tw:font-auth-body',
  pill: 'tw:min-h-control-height-transcription tw:rounded-chip tw:px-18 tw:py-0 tw:text-button tw:font-label tw:font-auth-body',
  tour: 'tw:min-h-tour tw:rounded-card tw:px-16 tw:py-0 tw:text-button tw:font-label tw:font-control',
  dense: 'tw:min-h-control-height-admin tw:rounded-admin-control tw:px-14 tw:py-10 tw:text-body-small tw:font-regular tw:font-auth-mono',
  link: 'tw:min-h-32 tw:rounded-field tw:px-0 tw:py-4 tw:text-label tw:font-label tw:font-control',
};
const buttonIntents: Record<ButtonIntent, string> = {
  secondary: 'tw:bg-transparent tw:text-ink tw:border-rule-strong tw:hover:border-ink-secondary',
  primary: 'tw:bg-ink tw:text-surface-sunken tw:border-ink tw:hover:bg-action-hover',
  danger: 'tw:bg-danger tw:text-on-danger tw:border-danger',
  quiet: 'tw:bg-transparent tw:text-ink-secondary tw:border-transparent tw:hover:text-ink',
};
 function buttonRecipeStyles({variant = 'standard', intent = 'secondary', pressed = false}: ButtonOptions = {}) {
  const color = variant === 'tour' ? (intent === 'secondary' || intent === 'quiet' ? 'tw:bg-transparent tw:text-surface-sunken tw:border-tour-rule' : 'tw:bg-surface tw:text-ink tw:border-surface tw:hover:bg-surface-overlay') : variant === 'dense' ? (intent==='danger' ? 'tw:bg-transparent tw:text-admin-danger tw:border-admin-danger' : 'tw:bg-transparent tw:text-admin-ink tw:border-admin-rule') : buttonIntents[intent];
  return [controlBase,variant==='dense'?denseDisabled:disabledRecipe,variant==='dense'?'tw:leading-admin':'tw:leading-body', 'tw:inline-flex tw:items-center tw:justify-center tw:gap-8 tw:border tw:border-solid tw:whitespace-nowrap tw:cursor-pointer', buttonShapes[variant], color, pressed ? 'tw:shadow-emboss-pressed' : ''].join(' ');
}
export const iconButtonVariants = ['standard','small','transcription','admin-close','admin-copy'] as const;
export interface IconButtonOptions { variant?: typeof iconButtonVariants[number] }
 function iconButtonRecipeStyles({variant='standard'}: IconButtonOptions = {}) {
  return [controlBase,disabledRecipe,'tw:min-h-0 tw:leading-body tw:font-control tw:inline-grid tw:place-items-center tw:flex-none tw:border-0 tw:bg-transparent tw:text-ink-secondary tw:p-0 tw:cursor-pointer tw:hover:bg-surface-overlay tw:hover:text-ink',
    variant === 'small' || variant === 'admin-copy' ? 'tw:size-32' : 'tw:size-40', variant.startsWith('admin') ? 'tw:rounded-admin-control' : 'tw:rounded-icon'].join(' ');
}
export const fieldVariants = ['boxed','ruled','domain','transcription','admin'] as const;
export type FieldVariant = typeof fieldVariants[number];
export interface FieldOptions { variant?: FieldVariant; invalid?: boolean }
 function fieldRecipeStyles({variant='boxed', invalid=false}: FieldOptions = {}, kind:'input'|'select'|'textarea'='input') {
  const admin = variant === 'admin';
  const ruled = variant !== 'boxed';
  return {
    root: 'tw:grid tw:gap-6 tw:min-w-0 tw:font-body',
    label: ruled && !admin ? 'tw:font-auth-mono tw:text-caption tw:font-emphasis tw:uppercase tw:tracking-auth-label tw:leading-field tw:text-ink-secondary' : 'tw:text-label tw:font-body tw:leading-body tw:text-ink-secondary',
    control: [controlBase,disabledRecipe, 'tw:block tw:w-full tw:min-w-0 tw:font-regular tw:disabled:cursor-default',
      kind==='textarea' && admin ? 'tw:h-auto tw:min-h-textarea tw:resize-y tw:border tw:border-solid tw:rounded-field tw:p-10 tw:font-auth-body tw:text-body tw:leading-admin tw:bg-admin-surface tw:text-admin-ink' :
      ruled ? `tw:rounded-field tw:border-0 tw:border-b tw:border-solid ${variant==='domain'?'tw:py-8':'tw:py-10'} tw:leading-field ${admin ? 'tw:px-2 tw:bg-admin-surface tw:text-admin-ink tw:font-auth-body tw:text-body' : variant === 'domain' ? 'tw:px-0 tw:bg-transparent tw:text-ink tw:font-auth-body tw:text-body' : 'tw:px-0 tw:bg-transparent tw:text-ink tw:font-auth-body tw:text-input'}` : (kind==='textarea'?'tw:h-auto tw:min-h-textarea tw:resize-y tw:p-10':'tw:h-control-height tw:px-12 tw:py-0')+' tw:rounded-card tw:border tw:border-solid tw:bg-surface tw:text-ink tw:font-control tw:text-body tw:leading-body',
      invalid ? 'tw:border-danger' : admin?'tw:border-admin-rule tw:focus:border-focus': ruled?'tw:border-ink-secondary tw:focus:border-focus':'tw:border-rule-strong tw:focus:border-ink-secondary', ruled ? 'tw:focus:shadow-focus' : '', 'tw:focus:outline-none' ].join(' '),
    hint: 'tw:m-0 tw:text-label tw:font-body tw:leading-body tw:text-ink-secondary',
    error: 'tw:m-0 tw:text-label tw:font-body tw:leading-body tw:text-danger',
  };
}
 function inputRecipeStyles(options: FieldOptions = {}) { return fieldRecipe(options).control; }
 function selectRecipeStyles(options: FieldOptions = {}) { return fieldRecipe(options).control; }
 function textareaRecipeStyles(options: FieldOptions = {}) { return fieldRecipe(options,'textarea').control; }
export const checkboxVariants = ['standard','permission','export'] as const;
export interface CheckboxOptions { variant?: typeof checkboxVariants[number] }
 function checkboxRecipeStyles({variant='standard'}: CheckboxOptions = {}) {
  return {root:'tw:inline-flex tw:items-center tw:gap-8 tw:font-auth-body tw:text-label tw:text-ink',control:controlBase+' '+disabledRecipe+' tw:appearance-auto tw:p-0 tw:shrink-0 '+(variant === 'permission' ? 'tw:size-20 tw:accent-admin-accent' : 'tw:size-18 tw:accent-accent')};
}
export const switchVariants = ['player','admin','capability'] as const;
export interface SwitchOptions { variant?: typeof switchVariants[number]; checked?: boolean }
 function switchRecipeStyles({variant='player',checked=false}: SwitchOptions = {}) {
  const sizes = {player:'tw:w-52 tw:h-32 tw:p-4',admin:'tw:w-48 tw:h-26 tw:p-3',capability:'tw:w-28 tw:h-16 tw:p-2'};
  const thumbs = {player:'tw:size-24',admin:'tw:size-18',capability:'tw:size-10'};
  return {label:'tw:relative tw:inline-flex tw:items-center tw:gap-8 tw:font-auth-body tw:text-small tw:text-ink-secondary tw:cursor-pointer',input:'tw:sr-only tw:peer',root:controlBase+' '+disabledRecipe+' tw:peer-focus-visible:outline-solid tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-focus tw:peer-focus-visible:outline-offset-4 tw:peer-disabled:opacity-(--ds-opacity-disabled) tw:min-h-0 tw:leading-body tw:relative tw:inline-flex tw:items-center tw:shrink-0 tw:rounded-chip tw:border-solid tw:cursor-pointer '+sizes[variant]+' '+(variant === 'player' ? 'tw:border-0 '+(checked ? 'tw:bg-ink' : 'tw:bg-surface-hover') : 'tw:border '+(checked ? variant === 'admin' ? 'tw:bg-admin-accent tw:border-admin-secondary' : 'tw:bg-accent tw:border-accent' : 'tw:bg-transparent tw:border-ink-secondary')),
    thumb:'tw:block tw:rounded-round tw:shrink-0 tw:transition-transform tw:duration-switch tw:motion-reduce:transition-none '+thumbs[variant]+' '+(checked ? 'tw:bg-surface-sunken '+({player:'tw:translate-x-20',admin:'tw:translate-x-21',capability:'tw:translate-x-12'}[variant]) : variant === 'player' ? 'tw:bg-ink-secondary' : 'tw:bg-ink')};
}

export function buttonRecipe(...args: Parameters<typeof buttonRecipeStyles>): ReturnType<typeof buttonRecipeStyles> { return normalizeRecipe(buttonRecipeStyles(...args)); }
export function iconButtonRecipe(...args: Parameters<typeof iconButtonRecipeStyles>): ReturnType<typeof iconButtonRecipeStyles> { return normalizeRecipe(iconButtonRecipeStyles(...args)); }
export function fieldRecipe(...args: Parameters<typeof fieldRecipeStyles>): ReturnType<typeof fieldRecipeStyles> { return normalizeRecipe(fieldRecipeStyles(...args)); }
export function inputRecipe(...args: Parameters<typeof inputRecipeStyles>): ReturnType<typeof inputRecipeStyles> { return normalizeRecipe(inputRecipeStyles(...args)); }
export function selectRecipe(...args: Parameters<typeof selectRecipeStyles>): ReturnType<typeof selectRecipeStyles> { return normalizeRecipe(selectRecipeStyles(...args)); }
export function textareaRecipe(...args: Parameters<typeof textareaRecipeStyles>): ReturnType<typeof textareaRecipeStyles> { return normalizeRecipe(textareaRecipeStyles(...args)); }
export function checkboxRecipe(...args: Parameters<typeof checkboxRecipeStyles>): ReturnType<typeof checkboxRecipeStyles> { return normalizeRecipe(checkboxRecipeStyles(...args)); }
export function switchRecipe(...args: Parameters<typeof switchRecipeStyles>): ReturnType<typeof switchRecipeStyles> { return normalizeRecipe(switchRecipeStyles(...args)); }
