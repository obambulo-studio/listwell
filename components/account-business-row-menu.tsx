"use client";

import {
  Building03Icon,
  ChartIncreaseIcon,
  CreditCardIcon,
  Delete02Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Dispatch, KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";

import {
  BusinessNameRenameDialog,
  BusinessRemoveDialog,
  MonthlyScansUpgradeDialog,
} from "@/components/chat-report-insight";
import { Icon } from "@/components/icon";
import GlideMenu from "@/components/primitives/glide-menu";
import { removeOwnedBusiness } from "@/lib/account-business-remove";
import { accountScanMenuFlags } from "@/lib/account-scan-menu";
import { requestCheckoutUrl } from "@/lib/polar";
import { accountPlanSchema, checkoutPlanSchema } from "@/lib/schema";

const menuIconClass = "listwell-account-menu__icon";

const MENU_VIEWPORT_PAD = 16;
const MENU_TRIGGER_GAP = 6;

const placeAccountMenu = (
  trigger: HTMLElement,
  menu: HTMLElement
): { left: number; top: number } => {
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const maxTop = window.innerHeight - MENU_VIEWPORT_PAD - menuRect.height;
  let top = triggerRect.bottom + MENU_TRIGGER_GAP;
  if (top > maxTop) {
    top = Math.max(
      MENU_VIEWPORT_PAD,
      triggerRect.top - MENU_TRIGGER_GAP - menuRect.height
    );
  }
  let left = triggerRect.right - menuRect.width;
  const maxLeft = window.innerWidth - MENU_VIEWPORT_PAD - menuRect.width;
  left = Math.max(MENU_VIEWPORT_PAD, Math.min(left, maxLeft));
  return { left, top };
};

const rowMenuItems = (menu: HTMLElement | null): HTMLElement[] => {
  if (!menu) {
    return [];
  }
  return [...menu.querySelectorAll("[role='menuitem']")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
};

interface AccountBusinessRowMenuDialogState {
  checkoutError: string | null;
  monthlyOpen: boolean;
  redirecting: boolean;
  removeError: string | null;
  removeOpen: boolean;
  removing: boolean;
  renameOpen: boolean;
}

type AccountBusinessRowMenuDialogAction =
  | { error: string; type: "monthly-failed" }
  | { open: boolean; type: "monthly-open" }
  | { type: "monthly-start" }
  | { type: "open-monthly" }
  | { type: "open-remove" }
  | { type: "open-rename" }
  | { error: string; type: "remove-failed" }
  | { open: boolean; type: "remove-open" }
  | { type: "remove-start" }
  | { type: "remove-succeeded" }
  | { open: boolean; type: "rename-open" };

const initialAccountBusinessRowMenuDialogState: AccountBusinessRowMenuDialogState =
  {
    checkoutError: null,
    monthlyOpen: false,
    redirecting: false,
    removeError: null,
    removeOpen: false,
    removing: false,
    renameOpen: false,
  };

const accountBusinessRowMenuDialogReducer = (
  state: AccountBusinessRowMenuDialogState,
  action: AccountBusinessRowMenuDialogAction
): AccountBusinessRowMenuDialogState => {
  if (action.type === "open-rename") {
    return { ...state, renameOpen: true };
  }
  if (action.type === "rename-open") {
    return { ...state, renameOpen: action.open };
  }
  if (action.type === "open-monthly") {
    return { ...state, checkoutError: null, monthlyOpen: true };
  }
  if (action.type === "monthly-open") {
    return { ...state, monthlyOpen: action.open };
  }
  if (action.type === "monthly-start") {
    return { ...state, checkoutError: null, redirecting: true };
  }
  if (action.type === "monthly-failed") {
    return { ...state, checkoutError: action.error, redirecting: false };
  }
  if (action.type === "open-remove") {
    return { ...state, removeError: null, removeOpen: true };
  }
  if (action.type === "remove-open") {
    return { ...state, removeOpen: action.open };
  }
  if (action.type === "remove-start") {
    return { ...state, removeError: null, removing: true };
  }
  if (action.type === "remove-succeeded") {
    return { ...state, removeOpen: false, removing: false };
  }
  if (action.type === "remove-failed") {
    return { ...state, removeError: action.error, removing: false };
  }
  return state;
};

interface AccountBusinessRowMenuPanelProps {
  businessId: string;
  canAddMonthlyScans: boolean;
  canCancelMonthlyScans: boolean;
  canRemove: boolean;
  menuId: string;
  menuLabel: string;
  menuRef: RefObject<HTMLDivElement | null>;
  onAddMonthlyScans: () => void;
  onClose: () => void;
  onRemove: () => void;
  onRename: () => void;
}

const AccountBusinessRowMenuPanel = ({
  businessId,
  canAddMonthlyScans,
  canCancelMonthlyScans,
  canRemove,
  menuId,
  menuLabel,
  menuRef,
  onAddMonthlyScans,
  onClose,
  onRemove,
  onRename,
}: AccountBusinessRowMenuPanelProps) => {
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.getAttribute("role") !== "menuitem"
    ) {
      return;
    }

    const items = rowMenuItems(menuRef.current);
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

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      tabIndex={-1}
      aria-label={menuLabel}
      className="listwell-account-menu listwell-account-menu--fixed"
      onKeyDown={handleMenuKeyDown}
    >
      <GlideMenu className="listwell-account-menu__list">
        <Link
          href={`/${businessId}`}
          role="menuitem"
          data-menu-row
          className="listwell-account-menu__item"
          onClick={() => {
            onClose();
          }}
        >
          <Icon className={menuIconClass} icon={Building03Icon} size={15} />
          View report
        </Link>
        {canRemove ? (
          <button
            type="button"
            role="menuitem"
            data-menu-row
            className="listwell-account-menu__item"
            onClick={onRename}
          >
            <Icon className={menuIconClass} icon={PencilEdit02Icon} size={15} />
            Rename
          </button>
        ) : null}
        {canRemove ? (
          <Link
            href={`/account/analytics/${businessId}`}
            role="menuitem"
            data-menu-row
            className="listwell-account-menu__item"
            onClick={() => {
              onClose();
            }}
          >
            <Icon className={menuIconClass} icon={ChartIncreaseIcon} size={15} />
            Web analytics
          </Link>
        ) : null}
        {canAddMonthlyScans ? (
          <button
            type="button"
            role="menuitem"
            data-menu-row
            className="listwell-account-menu__item"
            onClick={onAddMonthlyScans}
          >
            <Icon className={menuIconClass} icon={RefreshIcon} size={15} />
            Add monthly scans
          </button>
        ) : null}
        {canCancelMonthlyScans ? (
          // react-doctor-disable-next-line react-doctor/nextjs-no-a-element -- billing portal is a route handler, not a page
          <a // eslint-disable-line nextjs/no-html-link-for-pages -- billing portal is a route handler, not a page
            href="/api/account/billing"
            role="menuitem"
            data-menu-row
            className="listwell-account-menu__item"
            onClick={() => {
              onClose();
            }}
          >
            <Icon className={menuIconClass} icon={CreditCardIcon} size={15} />
            Manage plan
          </a>
        ) : null}
        {canRemove ? (
          <>
            <div className="listwell-account-menu__rule" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              data-menu-row
              className="listwell-account-menu__item listwell-account-menu__item--logout"
              onClick={onRemove}
            >
              <Icon className={menuIconClass} icon={Delete02Icon} size={15} />
              Remove business
            </button>
          </>
        ) : null}
      </GlideMenu>
    </div>
  );
};

interface AccountBusinessRowMenuDialogsProps {
  businessId: string;
  businessName: string;
  canAddMonthlyScans: boolean;
  canRemove: boolean;
  dialogs: AccountBusinessRowMenuDialogState;
  dispatchDialog: Dispatch<AccountBusinessRowMenuDialogAction>;
  onConfirmMonthly: () => void;
  onConfirmRemove: () => void;
  onRenamed: () => void;
}

const AccountBusinessRowMenuDialogs = ({
  businessId,
  businessName,
  canAddMonthlyScans,
  canRemove,
  dialogs,
  dispatchDialog,
  onConfirmMonthly,
  onConfirmRemove,
  onRenamed,
}: AccountBusinessRowMenuDialogsProps) => (
  <>
    {canRemove ? (
      <BusinessNameRenameDialog
        key={
          dialogs.renameOpen
            ? `${businessId}-rename-open`
            : `${businessId}-rename-closed`
        }
        businessId={businessId}
        name={businessName}
        open={dialogs.renameOpen}
        onOpenChange={(open) => {
          dispatchDialog({ open, type: "rename-open" });
        }}
        onRenamed={onRenamed}
      />
    ) : null}
    {canAddMonthlyScans ? (
      <MonthlyScansUpgradeDialog
        busy={dialogs.redirecting}
        error={dialogs.checkoutError}
        open={dialogs.monthlyOpen}
        onConfirm={onConfirmMonthly}
        onOpenChange={(open) => {
          dispatchDialog({ open, type: "monthly-open" });
        }}
      />
    ) : null}
    {canRemove ? (
      <BusinessRemoveDialog
        businessName={businessName}
        busy={dialogs.removing}
        error={dialogs.removeError}
        open={dialogs.removeOpen}
        onConfirm={onConfirmRemove}
        onOpenChange={(open) => {
          dispatchDialog({ open, type: "remove-open" });
        }}
      />
    ) : null}
  </>
);

const accountBusinessRowMenuPropsSchema = z.object({
  businessId: z.string().min(1),
  businessName: z.string(),
  canRemove: z.boolean(),
  monthlyScansAvailable: z.boolean(),
  plan: accountPlanSchema,
});

export type AccountBusinessRowMenuProps = z.infer<
  typeof accountBusinessRowMenuPropsSchema
>;

export const AccountBusinessRowMenu = (input: AccountBusinessRowMenuProps) => {
  const parsed = accountBusinessRowMenuPropsSchema.parse(input);
  const { businessId, businessName, canRemove, monthlyScansAvailable, plan } =
    parsed;

  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { refresh } = useRouter();
  const [open, setOpen] = useState(false);
  const [dialogs, dispatchDialog] = useReducer(
    accountBusinessRowMenuDialogReducer,
    initialAccountBusinessRowMenuDialogState
  );

  const { canAddMonthlyScans, canCancelMonthlyScans } = accountScanMenuFlags({
    monthlyScansAvailable,
    plan,
  });

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };
  const onDismissMenu = useEffectEvent((restoreFocus = false) => {
    close(restoreFocus);
  });
  const syncMenuPosition = useEffectEvent(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!(trigger && menu)) {
      return;
    }
    const { left, top } = placeAccountMenu(trigger, menu);
    menu.style.cssText = `left: ${left}px; top: ${top}px;`;
  });

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    syncMenuPosition();
    const onRelayout = () => {
      syncMenuPosition();
    };
    window.addEventListener("resize", onRelayout);
    window.addEventListener("scroll", onRelayout, true);
    return () => {
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (
        target instanceof Node &&
        (rootRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
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
    const items = rowMenuItems(menuRef.current);
    items[0]?.focus();
  }, [open]);

  const startMonthlyCheckout = () => {
    void (async () => {
      dispatchDialog({ type: "monthly-start" });
      try {
        const url = await requestCheckoutUrl(
          businessId,
          checkoutPlanSchema.parse("monthly")
        );
        window.location.assign(url);
      } catch (error) {
        dispatchDialog({
          error: error instanceof Error ? error.message : "Checkout failed",
          type: "monthly-failed",
        });
      }
    })();
  };

  const openAddMonthlyScans = () => {
    close();
    dispatchDialog({ type: "open-monthly" });
  };

  const openRename = () => {
    close();
    dispatchDialog({ type: "open-rename" });
  };

  const openRemove = () => {
    close();
    dispatchDialog({ type: "open-remove" });
  };

  const confirmRemove = () => {
    void (async () => {
      dispatchDialog({ type: "remove-start" });
      try {
        await removeOwnedBusiness(businessId);
        dispatchDialog({ type: "remove-succeeded" });
        refresh();
      } catch (error) {
        dispatchDialog({
          error:
            error instanceof Error
              ? error.message
              : "Could not remove this business",
          type: "remove-failed",
        });
      }
    })();
  };

  const menuLabel = `Actions for ${businessName}`;

  return (
    <>
      <div ref={rootRef} className="listwell-account-row__menu">
        <button
          ref={triggerRef}
          type="button"
          className="listwell-account-row__menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={menuLabel}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          <Icon icon={MoreVerticalIcon} size={16} />
        </button>
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <AccountBusinessRowMenuPanel
              businessId={businessId}
              canAddMonthlyScans={canAddMonthlyScans}
              canCancelMonthlyScans={canCancelMonthlyScans}
              canRemove={canRemove}
              menuId={menuId}
              menuLabel={menuLabel}
              menuRef={menuRef}
              onAddMonthlyScans={openAddMonthlyScans}
              onClose={() => {
                close();
              }}
              onRemove={openRemove}
              onRename={openRename}
            />,
            document.body
          )
        : null}
      <AccountBusinessRowMenuDialogs
        businessId={businessId}
        businessName={businessName}
        canAddMonthlyScans={canAddMonthlyScans}
        canRemove={canRemove}
        dialogs={dialogs}
        dispatchDialog={dispatchDialog}
        onConfirmMonthly={startMonthlyCheckout}
        onConfirmRemove={confirmRemove}
        onRenamed={() => {
          refresh();
        }}
      />
    </>
  );
};
