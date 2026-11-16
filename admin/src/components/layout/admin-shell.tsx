import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowUpRight, LogOut, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAdminAccount } from "@/components/account-provider";
import {
  adminNavigation,
  currentAdminPage,
} from "@/components/admin/navigation";
import { OverlayRoot } from "@/components/overlay-root";
import { SkipToMain } from "@/components/skip-to-main";
import { useSiteBranding } from "@/components/site-branding-provider";
import { ThemeSwitch } from "@/components/theme-switch";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { getCookie } from "@/lib/cookies";
import { siteLogoUrl } from "@/lib/site-settings";
import Link from "@/routing/link";
import { studioHref } from "@/routing/paths";
import { Header } from "./header";

function AdminSidebar({ current }: { current: string }) {
  const { branding } = useSiteBranding();
  const { account, refresh } = useAdminAccount();
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const logo = siteLogoUrl(branding.logoPath);

  function logout() {
    window.localStorage.removeItem("istudio-admin-token");
    refresh();
    router.history.replace("/admin/login");
  }

  return (
    <Sidebar collapsible="icon" variant="inset" aria-label="后台导航">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="运营概览" asChild>
              <Link href="/admin/" onClick={() => setOpenMobile(false)}>
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      className="size-full object-contain"
                    />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                </span>
                <span className="grid min-w-0 flex-1 text-left">
                  <strong className="truncate text-sm font-semibold">
                    {branding.name}
                  </strong>
                  <span className="truncate text-xs text-muted-foreground">
                    运营后台
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {adminNavigation.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map(({ href, title, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={title}
                    isActive={current === href}
                  >
                    <Link
                      href={href}
                      aria-current={current === href ? "page" : undefined}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="truncate px-2 pt-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {account.user?.username}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              tooltip="退出后台"
              onClick={logout}
            >
              <LogOut aria-hidden="true" />
              <span>退出后台</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const path = useLocation({ select: (location) => location.pathname });
  const page = currentAdminPage(path.replace(/\/$/, ""));
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k" &&
        !event.repeat
      ) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    document.title = `${page?.title ?? "运营后台"} · iStudio`;
  }, [page?.title]);

  return (
    <OverlayRoot className="admin-shell admin-app">
      <SidebarProvider
        defaultOpen={getCookie("sidebar_state") !== "false"}
        className="admin-frame"
      >
        <SkipToMain />
        <AdminSidebar current={page?.href ?? ""} />
        <SidebarInset className="admin-inset">
          <Header className="admin-topbar bg-card">
            <div className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
              {page ? (
                <>
                  <span className="hidden text-muted-foreground xl:inline">
                    {page.group}
                    <span className="px-2" aria-hidden="true">/</span>
                  </span>
                  <span>{page.title}</span>
                </>
              ) : (
                "运营后台"
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="justify-start text-muted-foreground max-sm:size-9 max-sm:justify-center max-sm:px-0"
              onClick={() => setSearchOpen(true)}
              aria-label="搜索页面"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Search data-icon="inline-start" />
              <span className="hidden sm:inline">搜索页面</span>
              <kbd className="ml-3 hidden rounded border bg-muted px-1 text-xs sm:inline">
                ⌘ K
              </kbd>
            </Button>
            <ThemeSwitch />
            <Button variant="ghost" size="icon" asChild>
              <a href={studioHref()} aria-label="返回前台" title="返回前台">
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </Header>
          <div
            id="admin-main"
            className="admin-content"
            key={path}
            tabIndex={-1}
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="搜索后台页面"
        description="根据页面名称搜索并跳转"
      >
        <CommandInput placeholder="输入页面名称…" />
        <CommandList>
          <CommandEmpty>没有匹配的页面</CommandEmpty>
          {adminNavigation.map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map(({ href, title, description, icon: Icon }) => (
                <CommandItem
                  key={href}
                  value={title}
                  keywords={[group.title, description]}
                  onSelect={() => {
                    setSearchOpen(false);
                    router.history.push(href);
                  }}
                >
                  <Icon aria-hidden="true" />
                  {title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </OverlayRoot>
  );
}
