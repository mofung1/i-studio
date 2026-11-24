import { CanvasEditor } from '@/components/canvas/canvas-editor'

export default async function CanvasEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CanvasEditor id={id} />
}
