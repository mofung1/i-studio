'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, ChevronsUpDown, LogOut, Settings2, Sparkles } from 'lucide-react'
import { useAdminAccount } from '@/components/account-provider'
import { useSiteBranding } from '@/components/site-branding-provider'
import { BrandLogo } from '@/components/brand'
import { siteLogoUrl } from '@/lib/site-settings'
import { ThemeToggle } from '@/components/theme-toggle'
import { adminNavigation, currentAdminPage } from './navigation'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from './ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Separator } from './ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar'

function AccountMenu({ sidebar = false }: { sidebar?: boolean }) {
  const { account, refresh } = useAdminAccount()
  const username = account.user?.username ?? '管理员'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {sidebar ? (
          <SidebarMenuButton size="lg" tooltip="账户菜单">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{username}</span>
              <span className="text-xs text-muted-foreground">管理员</span>
            </span>
            <ChevronsUpDown className="ml-auto" />
          </SidebarMenuButton>
        ) : (
          <Button variant="ghost" size="icon" aria-label="账户菜单">
            <Avatar className="size-8">
              <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={sidebar ? 'top' : 'bottom'} className="w-56">
        <DropdownMenuLabel>
          {username}
          <p className="text-xs font-normal text-muted-foreground">iStudio 管理员</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/studio?mode=general">
              <ArrowUpRight />
              返回创作工作台
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.localStorage.removeItem('istudio-admin-token')
              refresh()
            }}
          >
            <LogOut />
            退出后台
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppSidebar() {
  const path = usePathname()
  const { branding } = useSiteBranding()
  const current = currentAdminPage(path)
  const { setOpenMobile } = useSidebar()
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="iStudio Admin">
              <Link href="/admin" onClick={() => setOpenMobile(false)}>
                <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {branding.logoPath ? (
                    <BrandLogo src={siteLogoUrl(branding.logoPath)} size={20} />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{branding.name}</span>
                  <span className="text-xs text-muted-foreground">运营管理</span>
                </span>
                <Badge variant="outline">管理端</Badge>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="后台导航">
          {adminNavigation.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={current?.href === item.href}
                        tooltip={item.title}
                      >
                        <Link
                          href={item.href}
                          aria-current={current?.href === item.href ? 'page' : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu sidebar />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function AdminWorkspaceShell({ children }: { children: ReactNode }) {
  const current = currentAdminPage(usePathname())
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem('istudio-admin-sidebar') !== 'collapsed')
    } catch {
      /* Use the expanded navigation when storage is unavailable. */
    }
  }, [])
  return (
    <SidebarProvider
      className="admin-layout"
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        try {
          window.localStorage.setItem('istudio-admin-sidebar', value ? 'expanded' : 'collapsed')
        } catch {
          /* Navigation stays usable without persistence. */
        }
      }}
    >
      <AppSidebar />
      <SidebarInset className="admin-workspace">
        <header className="admin-header">
          <SidebarTrigger aria-label="展开或收起导航" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <nav className="admin-top-navigation" aria-label="快捷导航">
            {[
              ['/admin', '概览'],
              ['/admin/users', '用户'],
              ['/admin/models', '模型'],
              ['/admin/settings', 'AI 服务'],
            ].map(([href, title]) => (
              <Link
                key={href}
                href={href!}
                aria-current={current?.href === href ? 'page' : undefined}
              >
                {title}
              </Link>
            ))}
          </nav>
          <Breadcrumb className="admin-header-breadcrumb">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{current?.title ?? '后台配置'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="admin-header-actions">
            <ThemeToggle />
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/site" aria-label="打开网站配置">
                <Settings2 />
              </Link>
            </Button>
            <AccountMenu />
          </div>
        </header>
        <div className="admin-content" id="admin-main" tabIndex={-1}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
