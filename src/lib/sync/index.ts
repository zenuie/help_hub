import { pullChanges } from './pull'
import { pushNeeds, pushTaskUpdates } from './push'

export async function foregroundSync() {
  await Promise.all([pushNeeds(), pushTaskUpdates()])
  await Promise.all([
    pullChanges('tasks'),
    pullChanges('needs'),
    pullChanges('markers')
  ])
}
export function setupForegroundSync() {
  const run = () => foregroundSync().catch(console.error)
  run()
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run()
  })
}
