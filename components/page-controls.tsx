"use client";

import {
  Add01Icon,
  Building03Icon,
  CreditCardIcon,
  Login01Icon,
  Logout01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent } from "react";

import { AccountAvatar } from "@/components/account-avatar";
import { useClientHydrated } from "@/components/convex-client-provider";
import { Icon } from "@/components/icon";
import GlideMenu from "@/components/primitives/glide-menu";
import {
  closeProfileSettings,
  openProfileSettings,
  ProfileSettingsDialog,
  profileSettingsSnapshot,
  subscribeProfileSettings,
} from "@/components/profile-form";
import { authClient } from "@/lib/auth-client";
import {
  isAccountPath,
  isBusinessReportPath,
  LISTWELL_CHAT_PATH,
} from "@/lib/listwell-routes";
import {
  clearChatSession,
  isRestorableChatSession,
  LISTWELL_CHAT_SESSION_EVENT,
  loadChatSession,
} from "@/lib/storage";
import { applyTheme } from "@/lib/theme";

export const LISTWELL_LOGOUT_EVENT = "listwell:logout";
export const LISTWELL_RESET_EVENT = "listwell:reset";

/** Drop the saved home chat so the next visit starts a blank business form. */
export const resetHomeBusinessForm = (): void => {
  clearChatSession();
  window.dispatchEvent(new Event(LISTWELL_RESET_EVENT));
};

export const AddBusinessLink = ({ className }: { className?: string }) => (
  <Link
    className={className}
    href="/"
    onClick={(event) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        resetHomeBusinessForm();
        return;
      }
      event.preventDefault();
      resetHomeBusinessForm();
      window.location.assign("/");
    }}
  >
    <Icon icon={Add01Icon} size={16} />
    Add business
  </Link>
);

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

const menuIconClass = "listwell-account-menu__icon";

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
  name,
  signedIn,
  authAvailable,
  signInHref,
  onClose,
  onLogout,
}: {
  status: AccountStatus;
  email: string | null;
  name: string | null;
  signedIn: boolean;
  authAvailable: boolean;
  signInHref: { pathname: "/sign-in"; query: { return: string } };
  onClose: (restoreFocus?: boolean) => void;
  onLogout: () => void;
}) => (
  <GlideMenu className="listwell-account-menu__list">
    {status === "signed_in" && email ? (
      <button
        type="button"
        role="menuitem"
        data-menu-row
        className="listwell-account-menu__identity"
        onClick={() => {
          onClose();
          openProfileSettings();
        }}
      >
        <span className="listwell-account-menu__copy">
          {name ? <span>{name}</span> : null}
          <span className={name ? "listwell-account-menu__meta" : undefined}>
            {maskAccountEmail(email)}
          </span>
        </span>
      </button>
    ) : null}

    {!signedIn && authAvailable ? (
      <Link
        href={signInHref}
        role="menuitem"
        data-menu-row
        className="listwell-account-menu__item"
        onClick={() => onClose()}
      >
        <Icon className={menuIconClass} icon={Login01Icon} size={15} />
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
        <Icon className={menuIconClass} icon={Login01Icon} size={15} />
        <span className="listwell-account-menu__copy">
          <span>Sign in</span>
          <span className="listwell-account-menu__meta">Coming soon</span>
        </span>
      </button>
    ) : null}

    <Link
      href="/account"
      role="menuitem"
      data-menu-row
      className="listwell-account-menu__item"
      onClick={() => onClose()}
    >
      <Icon className={menuIconClass} icon={Building03Icon} size={15} />
      My businesses
    </Link>
    <button
      type="button"
      role="menuitem"
      data-menu-row
      className="listwell-account-menu__item"
      onClick={() => {
        onClose();
        window.location.assign("/api/account/billing");
      }}
    >
      <Icon className={menuIconClass} icon={CreditCardIcon} size={15} />
      Manage billing
    </button>
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
          <Icon className={menuIconClass} icon={Logout01Icon} size={15} />
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
  const menuId = useId();

  useLayoutEffect(() => {
    applyTheme();
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const session = authClient.useSession();
  const clientReady = useClientHydrated();
  const [open, setOpen] = useState(false);
  const profileOpen = useSyncExternalStore(
    subscribeProfileSettings,
    profileSettingsSnapshot,
    () => false
  );
  const authAvailable = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const signInHref = {
    pathname: "/sign-in" as const,
    query: { return: "/account" },
  };

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);
  const onDismissMenu = useEffectEvent((restoreFocus = false) => {
    close(restoreFocus);
  });

  const sessionEmail = clientReady ? (session.data?.user.email ?? null) : null;
  const status = accountStatusFromSession(
    !clientReady || session.isPending,
    sessionEmail
  );
  const email = sessionEmail;
  const image = clientReady ? session.data?.user.image : null;
  const name = clientReady ? session.data?.user.name?.trim() || null : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      onDismissMenu();
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onDismissMenu(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    if (onLogout) {
      await authClient.signOut();
      onLogout();
      refresh();
      return;
    }
    await authClient.signOut();
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
        className="listwell-page-controls__btn listwell-page-controls__btn--round"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <AccountAvatar
          alt=""
          className="listwell-page-controls__avatar"
          email={email ?? ""}
          height={32}
          iconSize={16}
          image={image}
          width={32}
        />
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
            name={name}
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
      <ProfileSettingsDialog
        open={profileOpen}
        onOpenChange={(next) => {
          if (next) {
            openProfileSettings();
            return;
          }
          closeProfileSettings();
        }}
      />
    </div>
  );
};

const subscribeChatSession = (onStoreChange: () => void): (() => void) => {
  const onChange = () => {
    onStoreChange();
  };
  window.addEventListener(LISTWELL_CHAT_SESSION_EVENT, onChange);
  window.addEventListener(LISTWELL_RESET_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LISTWELL_CHAT_SESSION_EVENT, onChange);
    window.removeEventListener(LISTWELL_RESET_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

const chatSessionHasProgress = (): boolean => {
  const stored = loadChatSession();
  if (!stored) {
    return false;
  }
  return isRestorableChatSession(stored);
};

export const PageControls = ({ onReset }: { onReset?: () => void } = {}) => {
  const { push } = useRouter();
  const pathname = usePathname();
  const chatInProgress = useSyncExternalStore(
    subscribeChatSession,
    chatSessionHasProgress,
    () => false
  );

  const handleReset = useCallback(() => {
    if (onReset) {
      onReset();
      return;
    }
    resetHomeBusinessForm();
    if (pathname !== "/" && pathname !== LISTWELL_CHAT_PATH) {
      push(LISTWELL_CHAT_PATH);
    }
  }, [onReset, pathname, push]);

  const showReset =
    pathname === LISTWELL_CHAT_PATH &&
    !chatInProgress &&
    !isAccountPath(pathname) &&
    !isBusinessReportPath(pathname);

  if (!showReset) {
    return null;
  }

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
        <Icon icon={RefreshIcon} size={18} />
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
    </div>
  );
};
