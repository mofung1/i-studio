import { commerceRecipeUrl, getCommerceRecipe } from './commerce-recipe'
import { safeReturnPath } from './navigation'
import { studioCommerceTask, studioToolUrl, type StudioQuery } from './studio-navigation'

function creationReturnPath(pathname: string | null, query?: StudioQuery | null) {
  if (pathname !== '/studio' && pathname !== '/workbench') return null
  if (query?.get('mode') !== 'commerce') return studioToolUrl('general', undefined, query)

  const task = studioCommerceTask(query.get('task'))
  const recipe = getCommerceRecipe(query.get('recipe'))
  // Restore the draft's route identity without replaying a reference, template, or history handoff.
  return recipe?.task === task
    ? commerceRecipeUrl(recipe, query)
    : studioToolUrl('commerce', task, query)
}

export function creditHelpHref(pathname: string | null, query?: StudioQuery | null) {
  const returnTo = creationReturnPath(pathname, query)
  return returnTo ? `/account?${new URLSearchParams({ returnTo })}#credits` : '/account#credits'
}

export function creditReturnPath(value: string | null) {
  if (!value) return '/studio'
  const target = new URL(safeReturnPath(value), 'https://istudio.local')
  return creationReturnPath(target.pathname, target.searchParams) ?? '/studio'
}
