"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent } from "react";

import GlideMenu from "@/components/primitives/glide-menu";
import { authClient } from "@/lib/auth-client";
import { clearChatSession } from "@/lib/storage";
import {
  applyTheme,
  resolveTheme,
  subscribeTheme,
  toggleTheme,
} from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";

export const LISTWELL_LOGOUT_EVENT = "listwell:logout";
export const LISTWELL_RESET_EVENT = "listwell:reset";

type AccountStatus = "loading" | "signed_out" | "signed_in";

const maskAccountEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = local.charAt(0);
  return `${first}***@${domain}`;
};

const ResetIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const SunIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const AccountIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="8" r="3.25" />
    <path d="M5.5 19.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
  </svg>
);

const menuItems = (menu: HTMLElement | null): HTMLElement[] => {
  if (!menu) {
    return [];
  }
  return [...menu.querySelectorAll("[role='menuitem']")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
};

const accountStatusFromSession = (
  isPending: boolean,
  sessionEmail: string | null
): AccountStatus => {
  if (isPending) {
    return "loading";
  }
  if (sessionEmail) {
    return "signed_in";
  }
  return "signed_out";
};

const AccountMenuContent = ({
  status,
  email,
  signedIn,
  authAvailable,
  signInHref,
  onClose,
  onLogout,
}: {
  status: AccountStatus;
  email: string | null;
  signedIn: boolean;
  authAvailable: boolean;
  signInHref: "/sign-in" | { pathname: "/sign-in"; query: { return: string } };
  onClose: (restoreFocus?: boolean) => void;
  onLogout: () => void;
}) => (
  <GlideMenu
    className="listwell-account-menu__list"
    highlightClassName="inset-x-0 rounded-[8px] bg-hover"
  >
    {status === "signed_in" && email ? (
      <div className="listwell-account-menu__identity">
        {maskAccountEmail(email)}
      </div>
    ) : null}

    {!signedIn && authAvailable ? (
      <Link
        href={signInHref}
        role="menuitem"
        data-menu-row
        className="listwell-account-menu__item"
        onClick={() => onClose()}
      >
        Sign in
      </Link>
    ) : null}

    {!signedIn && !authAvailable ? (
      <button
        type="button"
        role="menuitem"
        data-menu-row
        className="listwell-account-menu__item"
        onClick={() => onClose(true)}
      >
        <span>Sign in</span>
        <span className="listwell-account-menu__meta">Coming soon</span>
      </button>
    ) : null}

    <Link
      href="/account"
      role="menuitem"
      data-menu-row
      className="listwell-account-menu__item"
      onClick={() => onClose()}
    >
      Your businesses
    </Link>
    <Link
      href="/account"
      role="menuitem"
      data-menu-row
      className="listwell-account-menu__item"
      onClick={() => onClose()}
    >
      Billing
    </Link>
    {signedIn ? (
      <>
        <div className="listwell-account-menu__rule" aria-hidden="true" />
        <button
          type="button"
          role="menuitem"
          data-menu-row
          className="listwell-account-menu__item listwell-account-menu__item--logout"
          onClick={onLogout}
        >
          Log out
        </button>
      </>
    ) : null}
  </GlideMenu>
);

export const AccountControl = ({
  onLogout,
}: { onLogout?: () => void } = {}) => {
  const { refresh } = useRouter();
  const pathname = usePathname();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const session = authClient.useSession();
  const [open, setOpen] = useState(false);
  const authAvailable = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const signInHref =
    pathname === "/sign-in"
      ? "/sign-in"
      : { pathname: "/sign-in" as const, query: { return: pathname } };

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const sessionEmail = session.data?.user.email ?? null;
  const status = accountStatusFromSession(session.isPending, sessionEmail);
  const email = sessionEmail;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      close();
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const items = menuItems(menuRef.current);
    items[0]?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.getAttribute("role") !== "menuitem"
    ) {
      return;
    }

    const items = menuItems(menuRef.current);
    if (items.length === 0) {
      return;
    }

    const { activeElement } = document;
    const current =
      activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const index = current === -1 ? 0 : (current + 1) % items.length;
      items[index]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const index =
        current === -1
          ? items.length - 1
          : (current - 1 + items.length) % items.length;
      items[index]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  const handleLogout = async () => {
    close();
    await authClient.signOut();
    if (onLogout) {
      onLogout();
      refresh();
      return;
    }
    clearChatSession();
    window.dispatchEvent(new Event(LISTWELL_LOGOUT_EVENT));
    refresh();
  };

  const signedIn = status === "signed_in" && email !== null;

  return (
    <div
      ref={rootRef}
      className="listwell-page-controls listwell-page-controls--account"
    >
      <button
        ref={triggerRef}
        type="button"
        className="listwell-page-controls__btn"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <AccountIcon />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label="Account"
          className="listwell-account-menu"
          onKeyDown={handleMenuKeyDown}
        >
          <AccountMenuContent
            status={status}
            email={email}
            signedIn={signedIn}
            authAvailable={authAvailable}
            signInHref={signInHref}
            onClose={close}
            onLogout={() => {
              void handleLogout();
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

export const PageControls = ({ onReset }: { onReset?: () => void } = {}) => {
  const { push } = useRouter();
  const pathname = usePathname();
  const theme = useSyncExternalStore(
    subscribeTheme,
    resolveTheme,
    (): ThemePreference => "light"
  );

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleReset = useCallback(() => {
    if (onReset) {
      onReset();
      return;
    }
    clearChatSession();
    window.dispatchEvent(new Event(LISTWELL_RESET_EVENT));
    if (pathname !== "/") {
      push("/");
    }
  }, [onReset, pathname, push]);

  const handleToggleTheme = useCallback(() => {
    toggleTheme(theme);
  }, [theme]);

  const themeLabel = theme === "dark" ? "Light mode" : "Dark mode";
  const themeDescription =
    theme === "dark"
      ? "Switch to a light background"
      : "Switch to a dark background";

  return (
    <div
      className="listwell-page-controls listwell-page-controls--dock"
      role="toolbar"
      aria-label="Page controls"
    >
      <button
        type="button"
        className="listwell-page-controls__btn"
        onClick={handleReset}
        aria-label="Reset chat"
        aria-describedby="page-controls-reset-desc"
      >
        <ResetIcon />
        <span
          id="page-controls-reset-desc"
          className="listwell-page-controls__popover-sr"
        >
          Reset chat. Clears conversation and starts over.
        </span>
        <span className="listwell-page-controls__popover" aria-hidden="true">
          <span className="listwell-page-controls__popover-label">
            Reset chat
          </span>
        </span>
      </button>
      <button
        type="button"
        className="listwell-page-controls__btn"
        onClick={handleToggleTheme}
        aria-label={themeLabel}
        aria-describedby="page-controls-theme-desc"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        <span
          id="page-controls-theme-desc"
          className="listwell-page-controls__popover-sr"
        >
          {themeLabel}. {themeDescription}.
        </span>
        <span className="listwell-page-controls__popover" aria-hidden="true">
          <span className="listwell-page-controls__popover-label">
            {themeLabel}
          </span>
        </span>
      </button>
    </div>
  );
};
