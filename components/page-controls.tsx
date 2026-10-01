"use client";

import {
  Add01Icon,
  Building03Icon,
  CreditCardIcon,
  Login01Icon,
  Logout01Icon,
  UserIcon,
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
} from "react";
import type { KeyboardEvent } from "react";

import { Icon } from "@/components/icon";
import GlideMenu from "@/components/primitives/glide-menu";
import { authClient } from "@/lib/auth-client";
import { clearChatSession } from "@/lib/storage";
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
  signInHref: "/sign-in" | { pathname: "/sign-in"; query: { return: string } };
  onClose: (restoreFocus?: boolean) => void;
  onLogout: () => void;
}) => (
  <GlideMenu className="listwell-account-menu__list">
    {status === "signed_in" && email ? (
      <Link
        href="/account/profile"
        role="menuitem"
        data-menu-row
        className="listwell-account-menu__identity"
        onClick={() => onClose()}
      >
        <Icon className={menuIconClass} icon={UserIcon} size={15} />
        <span className="listwell-account-menu__copy">
          {name ? <span>{name}</span> : null}
          <span className={name ? "listwell-account-menu__meta" : undefined}>
            {maskAccountEmail(email)}
          </span>
        </span>
      </Link>
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
      Your businesses
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
      Billing
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
  const pathname = usePathname();
  const menuId = useId();

  useLayoutEffect(() => {
    applyTheme();
  }, []);
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
  const onDismissMenu = useEffectEvent((restoreFocus = false) => {
    close(restoreFocus);
  });

  const sessionEmail = session.data?.user.email ?? null;
  const status = accountStatusFromSession(session.isPending, sessionEmail);
  const email = sessionEmail;
  const name = session.data?.user.name?.trim() || null;

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
        className="listwell-page-controls__btn"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Icon icon={UserIcon} size={18} />
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
    </div>
  );
};
