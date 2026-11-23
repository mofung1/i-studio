'use client'

import { ImagePlus, Plus } from 'lucide-react'
import {
  useRef,
  type ClipboardEvent,
  type ComponentProps,
  type DragEvent,
  type DragEventHandler,
} from 'react'
import { creationImageTypes } from '@/lib/creation-images'

interface ImageUploadButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'type'> {
  label: string
  variant?: 'dropzone' | 'tile' | 'button'
  hint?: string
  acceptedHint?: string
  describedBy?: string
}

export function ImageUploadButton({
  label,
  variant = 'dropzone',
  hint,
  acceptedHint,
  describedBy,
  className,
  ...props
}: ImageUploadButtonProps) {
  const layout = {
    dropzone: 'reference-dropzone',
    tile: 'add-thumb',
    button: 'studio-secondary',
  }[variant]

  return (
    <button
      type="button"
      className={className ? `${layout} ${className}` : layout}
      aria-label={label}
      aria-describedby={describedBy}
      {...props}
    >
      {variant === 'dropzone' ? (
        <>
          <span className="reference-dropzone-icon">
            <ImagePlus size={22} aria-hidden="true" />
          </span>
          <strong>{label}</strong>
          {hint && <span>{hint}</span>}
          {acceptedHint && <span className="reference-dropzone-hint">{acceptedHint}</span>}
        </>
      ) : (
        <>
          {variant === 'tile' ? (
            <span className="add-thumb-icon">
              <Plus size={18} aria-hidden="true" />
            </span>
          ) : (
            <ImagePlus size={17} aria-hidden="true" />
          )}
          <span>{label}</span>
          {hint && <small>{hint}</small>}
        </>
      )}
    </button>
  )
}

interface ImageDropOptions {
  onFiles: (files: File[]) => void
  onDraggingChange?: (dragging: boolean) => void
  disabled?: boolean
}

type ImageDropHandlers<Element extends HTMLElement> = Record<
  'onDragOver' | 'onDragLeave' | 'onDrop',
  DragEventHandler<Element>
>

function isLocalFileDrag(event: DragEvent<HTMLElement>) {
  // Events from a portaled picker can bubble through the workbench React tree.
  return (
    event.target instanceof Node &&
    event.currentTarget.contains(event.target) &&
    Array.from(event.dataTransfer?.types ?? []).includes('Files')
  )
}

function imageDropHandlers<Element extends HTMLElement>({
  onFiles,
  onDraggingChange,
  disabled,
}: ImageDropOptions): ImageDropHandlers<Element> {
  return {
    onDragOver(event) {
      if (!isLocalFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      onDraggingChange?.(!disabled)
    },
    onDragLeave(event) {
      const destination = event.relatedTarget
      if (destination instanceof Node && event.currentTarget.contains(destination)) return
      onDraggingChange?.(false)
    },
    onDrop(event) {
      if (!isLocalFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      onDraggingChange?.(false)
      const files = Array.from(event.dataTransfer.files)
      if (!disabled && files.length) onFiles(files)
    },
  }
}

interface ImageUploadDropAreaProps
  extends Omit<ComponentProps<'div'>, keyof ImageDropHandlers<HTMLDivElement>>,
    ImageDropOptions {}

export function ImageUploadDropArea({
  onFiles,
  onDraggingChange,
  disabled,
  ...area
}: ImageUploadDropAreaProps) {
  return (
    <div
      {...area}
      {...imageDropHandlers<HTMLDivElement>({ onFiles, onDraggingChange, disabled })}
    />
  )
}

export function handleImageUploadPaste(
  event: ClipboardEvent<HTMLElement>,
  onFiles: ImageDropOptions['onFiles'],
) {
  if (event.defaultPrevented) return
  const image = Array.from(event.clipboardData?.items ?? [])
    .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    ?.getAsFile()
  if (!image) return
  event.preventDefault()
  event.stopPropagation()
  onFiles([image])
}

interface ImageUploadProps
  extends Omit<ImageUploadButtonProps, 'onClick' | keyof ImageDropHandlers<HTMLButtonElement>> {
  inputLabel: string
  multiple?: boolean
  allowDrop?: boolean
  onFiles: (files: File[]) => void
}

export function ImageUpload({
  id,
  inputLabel,
  multiple = false,
  allowDrop = true,
  onFiles,
  disabled,
  ...button
}: ImageUploadProps) {
  const input = useRef<HTMLInputElement>(null)

  function selectFiles(files: File[]) {
    if (disabled || !files.length) return
    onFiles(files)
  }

  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={creationImageTypes.join(',')}
        aria-label={inputLabel}
        hidden
        disabled={disabled}
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          selectFiles(files)
        }}
      />
      <ImageUploadButton
        {...button}
        disabled={disabled}
        onClick={() => input.current?.click()}
        {...(allowDrop ? imageDropHandlers<HTMLButtonElement>({ onFiles, disabled }) : {})}
      />
    </>
  )
}
