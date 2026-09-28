import { redirect } from 'next/navigation'

/** 灵感瀑布流已经并入工作台的「灵感」菜单页，老链接继续可用。 */
export default function Page() {
  redirect('/workbench?view=inspire')
}
