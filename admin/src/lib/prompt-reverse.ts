export interface ReverseSettings {
  endpointId: string
  timeoutSeconds: number
  imageDetail: 'auto' | 'high' | 'low'
  retentionHours: number
}
export interface ReverseConfiguration {
  settings: ReverseSettings
  available: boolean
  reason: string
  serviceName: string
  model: string
}
