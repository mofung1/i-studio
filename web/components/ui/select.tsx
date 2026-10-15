'use client'

import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
} from 'react'

import { cn } from './lib/utils'

const SelectContext = createContext<{
  trigger: HTMLButtonElement | null
  setTrigger: (element: HTMLButtonElement | null) => void
} | null>(null)

function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  const context = useMemo(() => ({ trigger, setTrigger }), [trigger])
  return (
    <SelectContext.Provider value={context}>
      <SelectPrimitive.Root {...props} />
    </SelectContext.Provider>
  )
}

function SelectValue({ className, ...props }: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value className={cn('select-value', className)} {...props} />
}

function SelectGroup(props: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group {...props} />
}

function SelectTrigger({
  className,
  children,
  size = 'default',
  ref,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'default' | 'sm' | 'lg' }) {
  const context = useContext(SelectContext)
  const setTrigger = context?.setTrigger
  const triggerRef = useCallback(
    (element: HTMLButtonElement | null) => {
      setTrigger?.(element)
      if (typeof ref === 'function') {
        const cleanup = ref(element)
        if (typeof cleanup === 'function')
          return () => {
            setTrigger?.(null)
            cleanup()
          }
      } else if (ref) ref.current = element
    },
    [ref, setTrigger],
  )

  return (
    <SelectPrimitive.Trigger
      type="button"
      {...props}
      ref={triggerRef}
      className={cn('select-trigger', className)}
      data-size={size}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  portalContainer,
  onEscapeKeyDown,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content> & { portalContainer?: HTMLElement | null }) {
  const context = useContext(SelectContext)
  // Stay inside the owning modal/popover, including the browser's native top layer.
  const container =
    portalContainer ?? context?.trigger?.closest<HTMLElement>('[role="dialog"], dialog, [popover]')
  const hasGroups = Children.toArray(children).some(
    (child) =>
      isValidElement(child) && (child.type === SelectGroup || child.type === SelectPrimitive.Group),
  )
  const options = hasGroups ? children : <SelectPrimitive.Group>{children}</SelectPrimitive.Group>

  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        {...props}
        className={cn('select-content', className)}
        position="popper"
        sideOffset={6}
        collisionPadding={12}
        onEscapeKeyDown={(event) => {
          // Radix handles Escape in capture phase. Stop it before parent dialogs see it.
          event.stopPropagation()
          onEscapeKeyDown?.(event)
        }}
      >
        <SelectPrimitive.ScrollUpButton className="select-scroll-button">
          <ChevronUp size={16} aria-hidden="true" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="select-viewport">{options}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="select-scroll-button">
          <ChevronDown size={16} aria-hidden="true" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn('select-item', className)} {...props}>
      <SelectPrimitive.ItemText className="select-item-text">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="select-item-indicator">
        <Check size={14} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue }
