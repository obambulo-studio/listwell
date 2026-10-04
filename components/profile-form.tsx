"use client";

import { ChevronLeftIcon } from "@hugeicons/core-free-icons";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AccountAvatar } from "@/components/account-avatar";
import { useClientHydrated } from "@/components/convex-client-provider";
import { Icon } from "@/components/icon";
import { ButtonBusyLabel } from "@/components/listwell/button-busy-label";
import { LoadingSpinner } from "@/components/listwell/loading-spinner";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  accountImageFromSession,
  accountStoredProfileImage,
} from "@/lib/account-avatar";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/convex/server";
import {
  parseConvexStorageUploadResponse,
  PROFILE_PHOTO_ACCEPT,
  profilePhotoFileError,
} from "@/lib/profile-photo";
import { cn } from "@/lib/utils";

const profileNameSchema = z.string().trim().min(1).max(80);
const profileEmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const profileCodeSchema = z.string().regex(/^\d{6}$/u);

const authErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

type EmailStep = "edit" | "code";

interface ProfilePhotoState {
  imageBusy: boolean;
  imageError: string | null;
  uploadFile: File | null;
  uploadPreview: string | null;
}

interface ProfileState {
  code: string;
  email: string;
  emailBusy: boolean;
  emailError: string | null;
  emailStep: EmailStep;
  name: string;
  nameBusy: boolean;
  nameError: string | null;
}

type ProfileAction =
  | { type: "code"; code: string }
  | { type: "email"; email: string }
  | { type: "email-busy"; busy: boolean }
  | { type: "email-error"; error: string | null }
  | { type: "email-reset" }
  | { type: "email-saved" }
  | { type: "email-sent"; email: string }
  | { type: "name"; name: string }
  | { type: "name-busy"; busy: boolean }
  | { type: "name-error"; error: string | null }
  | { type: "name-saved" };

type ProfilePhotoAction =
  | { type: "image-busy"; busy: boolean }
  | { type: "image-error"; error: string | null }
  | { type: "image-saved" }
  | { type: "upload-clear" }
  | { type: "upload-select"; file: File; preview: string };

const profilePhotoReducer = (
  state: ProfilePhotoState,
  action: ProfilePhotoAction
): ProfilePhotoState => {
  if (action.type === "image-busy") {
    return { ...state, imageBusy: action.busy };
  }
  if (action.type === "image-error") {
    return { ...state, imageBusy: false, imageError: action.error };
  }
  if (action.type === "image-saved") {
    return {
      ...state,
      imageBusy: false,
      imageError: null,
      uploadFile: null,
      uploadPreview: null,
    };
  }
  if (action.type === "upload-clear") {
    return {
      ...state,
      uploadFile: null,
      uploadPreview: null,
    };
  }
  if (action.type === "upload-select") {
    return {
      ...state,
      imageError: null,
      uploadFile: action.file,
      uploadPreview: action.preview,
    };
  }
  return state;
};

const profileReducer = (
  state: ProfileState,
  action: ProfileAction
): ProfileState => {
  if (action.type === "name") {
    return { ...state, name: action.name, nameError: null };
  }
  if (action.type === "name-busy") {
    return { ...state, nameBusy: action.busy };
  }
  if (action.type === "name-error") {
    return { ...state, nameBusy: false, nameError: action.error };
  }
  if (action.type === "name-saved") {
    return {
      ...state,
      nameBusy: false,
      nameError: null,
    };
  }
  if (action.type === "email") {
    return {
      ...state,
      email: action.email,
      emailError: null,
    };
  }
  if (action.type === "code") {
    return { ...state, code: action.code, emailError: null };
  }
  if (action.type === "email-busy") {
    return { ...state, emailBusy: action.busy };
  }
  if (action.type === "email-error") {
    return { ...state, emailBusy: false, emailError: action.error };
  }
  if (action.type === "email-reset") {
    return {
      ...state,
      code: "",
      emailBusy: false,
      emailError: null,
      emailStep: "edit",
    };
  }
  if (action.type === "email-sent") {
    return {
      ...state,
      code: "",
      email: action.email,
      emailBusy: false,
      emailError: null,
      emailStep: "code",
    };
  }
  if (action.type === "email-saved") {
    return {
      ...state,
      code: "",
      emailBusy: false,
      emailError: null,
      emailStep: "edit",
    };
  }
  return state;
};

const maskAccountEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.charAt(0)}***@${domain}`;
};

const profileErrorMessage = (error: unknown, fallback: string): string => {
  const parsed = authErrorSchema.safeParse(error);
  if (!parsed.success) {
    return fallback;
  }
  const { code, message } = parsed.data;
  if (code === "INVALID_OTP" || message === "Invalid OTP") {
    return "That code is not valid";
  }
  if (code === "OTP_EXPIRED") {
    return "That code has expired. Send a new one.";
  }
  if (code === "TOO_MANY_ATTEMPTS") {
    return "Too many attempts. Send a new code.";
  }
  if (code === "UNAUTHORIZED") {
    return "Sign in again to update your profile";
  }
  if (message === "Email is the same") {
    return "That's already your email";
  }
  if (message === "Email already in use") {
    return "That email is already in use";
  }
  if (message && message.length > 0) {
    return message;
  }
  return fallback;
};

const BackChevron = () => <Icon icon={ChevronLeftIcon} size={15} />;

const profileDialogStorageKey = "listwell-profile-dialog";
const profileSettingsListeners = new Set<() => void>();
let profileSettingsOpen = false;

const emitProfileSettings = (): void => {
  for (const listener of profileSettingsListeners) {
    listener();
  }
};

const rememberProfileDialog = (open: boolean): void => {
  try {
    if (open) {
      sessionStorage.setItem(profileDialogStorageKey, "1");
      return;
    }
    sessionStorage.removeItem(profileDialogStorageKey);
  } catch {
    // Storage can be blocked. The in-memory flag still controls this page.
  }
};

export const openProfileSettings = (): void => {
  rememberProfileDialog(true);
  profileSettingsOpen = true;
  emitProfileSettings();
};

export const closeProfileSettings = (): void => {
  rememberProfileDialog(false);
  if (!profileSettingsOpen) {
    return;
  }
  profileSettingsOpen = false;
  emitProfileSettings();
};

export const restoreProfileSettings = (): void => {
  try {
    if (sessionStorage.getItem(profileDialogStorageKey) !== "1") {
      return;
    }
  } catch {
    return;
  }
  openProfileSettings();
};

export const subscribeProfileSettings = (
  listener: () => void
): (() => void) => {
  profileSettingsListeners.add(listener);
  return () => {
    profileSettingsListeners.delete(listener);
  };
};

export const profileSettingsSnapshot = (): boolean => profileSettingsOpen;

export const ProfileBackLink = () => (
  <Link className="listwell-back" href="/account">
    <BackChevron />
    Back
  </Link>
);

const ProfileError = ({ id, message }: { id: string; message: string }) => (
  <p id={id} className="listwell-panel__error" role="alert">
    {message}
  </p>
);

const profileFieldButtonClass = buttonVariants({ size: "sm" });

const sameAccountEmail = (email: string, currentEmail: string): boolean =>
  email.trim().toLowerCase() === currentEmail.trim().toLowerCase();

const canSendEmailCode = (email: string, currentEmail: string): boolean => {
  if (email.trim() === "") {
    return false;
  }
  return !sameAccountEmail(email, currentEmail);
};

const EmailChangePrompt = ({
  currentEmail,
  email,
}: {
  currentEmail: string;
  email: string;
}) => {
  if (!canSendEmailCode(email, currentEmail)) {
    return null;
  }
  return (
    <p className="listwell-panel__note">
      We&apos;ll send a code to the new address before it changes.
    </p>
  );
};

const ProfileDialogStatus = ({ pending }: { pending: boolean }) => (
  <p className="listwell-panel__note">
    {pending ? "Loading your profile." : "Sign in to update your profile."}
  </p>
);

const profilePhotoMatchesWideLayout = (): boolean =>
  window.matchMedia("(min-width: 640px)").matches;

const ProfilePhotoFields = ({
  avatarSize,
  currentEmail,
  matchedFieldsHeight,
  savedImage,
}: {
  avatarSize: number;
  currentEmail: string;
  matchedFieldsHeight: number | null;
  savedImage: string | null | undefined;
}) => {
  const { refresh } = useRouter();
  const uploadFieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.profilePhoto.generateUploadUrl);
  const finalizeUpload = useMutation(api.profilePhoto.finalizeUpload);
  const [state, dispatch] = useReducer(profilePhotoReducer, {
    imageBusy: false,
    imageError: null,
    uploadFile: null,
    uploadPreview: null,
  });
  const imageErrorId = `${uploadFieldId}-error`;
  const savedCustomImage = accountImageFromSession(savedImage);
  const storedProfileImage = accountStoredProfileImage(savedImage);
  const previewImage = state.uploadPreview ?? savedCustomImage ?? undefined;

  useEffect(
    () => () => {
      if (state.uploadPreview) {
        URL.revokeObjectURL(state.uploadPreview);
      }
    },
    [state.uploadPreview]
  );

  const clearUploadSelection = () => {
    if (state.uploadPreview) {
      URL.revokeObjectURL(state.uploadPreview);
    }
    dispatch({ type: "upload-clear" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const commitProfileImage = async (
    image: string | null,
    successMessage: string
  ): Promise<boolean> => {
    const result = await authClient.updateUser({ image });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not save your photo"),
        type: "image-error",
      });
      return false;
    }
    await authClient.getSession();
    refresh();
    clearUploadSelection();
    dispatch({ type: "image-saved" });
    toast.success(successMessage);
    return true;
  };

  const persistImage = async (image: string | null, successMessage: string) => {
    if (state.imageBusy) {
      return;
    }
    dispatch({ busy: true, type: "image-busy" });
    await commitProfileImage(image, successMessage);
  };

  const uploadPhoto = async (file: File) => {
    if (state.imageBusy) {
      return;
    }
    const fileError = profilePhotoFileError(file);
    if (fileError) {
      dispatch({ error: fileError, type: "image-error" });
      return;
    }
    dispatch({ busy: true, type: "image-busy" });
    const uploadUrl = await generateUploadUrl({}).catch(() => null);
    if (!uploadUrl) {
      dispatch({
        error: "Could not upload your photo",
        type: "image-error",
      });
      return;
    }
    const response = await fetch(uploadUrl, {
      body: file,
      headers: { "Content-Type": file.type },
      method: "POST",
    }).catch(() => null);
    if (!response?.ok) {
      dispatch({
        error: "Could not upload your photo",
        type: "image-error",
      });
      return;
    }
    const payload: unknown = await response.json().catch(() => null);
    const storageId = parseConvexStorageUploadResponse(payload);
    if (!storageId) {
      dispatch({
        error: "Could not upload your photo",
        type: "image-error",
      });
      return;
    }
    const finalizeResult = await finalizeUpload({
      storageId,
    })
      .then((url) => ({ status: "ok" as const, url }))
      .catch((error: unknown) => ({
        message:
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Could not upload your photo",
        status: "error" as const,
      }));
    if (finalizeResult.status === "error") {
      dispatch({ error: finalizeResult.message, type: "image-error" });
      return;
    }
    await commitProfileImage(finalizeResult.url, "Photo uploaded");
  };

  const removeImage = async () => {
    if (state.imageBusy || storedProfileImage === null) {
      return;
    }
    await persistImage(null, "Photo removed");
  };

  const onUploadFileChange = (file: File | undefined) => {
    if (!file) {
      return;
    }
    const fileError = profilePhotoFileError(file);
    if (fileError) {
      dispatch({ error: fileError, type: "image-error" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    if (state.uploadPreview) {
      URL.revokeObjectURL(state.uploadPreview);
    }
    dispatch({
      file,
      preview: URL.createObjectURL(file),
      type: "upload-select",
    });
    void uploadPhoto(file);
  };

  const openFilePicker = () => {
    if (state.imageBusy) {
      return;
    }
    fileInputRef.current?.click();
  };

  const showRemoveControl =
    storedProfileImage !== null && !state.imageBusy && !state.uploadFile;
  const showChangeHint = !showRemoveControl && !state.imageBusy;

  const avatarOverlayClass =
    "pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-[0.625rem] font-medium transition";

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 sm:min-h-0 sm:w-auto sm:gap-0 sm:self-stretch">
      <Label className="sr-only" htmlFor={uploadFieldId}>
        Upload photo
      </Label>
      <div
        className="group relative size-20 shrink-0 self-start sm:size-auto sm:max-w-full sm:self-stretch"
        style={
          matchedFieldsHeight === null
            ? undefined
            : {
                height: matchedFieldsHeight,
                width: matchedFieldsHeight,
              }
        }
      >
        <input
          ref={fileInputRef}
          accept={PROFILE_PHOTO_ACCEPT}
          className="sr-only"
          disabled={state.imageBusy}
          id={uploadFieldId}
          type="file"
          onChange={(event) => {
            onUploadFileChange(event.target.files?.[0]);
          }}
        />
        <button
          type="button"
          aria-busy={state.imageBusy || undefined}
          aria-describedby={state.imageError ? imageErrorId : undefined}
          aria-label="Upload photo"
          className="focus-visible:ring-ring focus-visible:ring-offset-background relative size-full overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={state.imageBusy}
          onClick={openFilePicker}
        >
          <AccountAvatar
            alt=""
            className="ring-border [@media(hover:hover)_and_(pointer:fine)]:group-hover:ring-muted-foreground/40 group-disabled:group-hover:ring-border size-full rounded-lg object-cover ring-1 transition"
            email={currentEmail}
            height={avatarSize}
            iconClassName="text-muted-foreground"
            image={previewImage ?? null}
            width={avatarSize}
          />
          {state.imageBusy ? (
            <span
              className={`${avatarOverlayClass} bg-foreground/45 text-background opacity-100`}
            >
              <LoadingSpinner className="border-background/40 border-t-background" />
            </span>
          ) : null}
          {showChangeHint ? (
            <span
              className={`${avatarOverlayClass} bg-foreground/0 text-background [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-foreground/45 opacity-0 group-disabled:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100`}
            >
              Change
            </span>
          ) : null}
        </button>
        {showRemoveControl ? (
          <button
            type="button"
            className="bg-foreground/45 text-background focus-visible:ring-ring focus-visible:ring-offset-background absolute inset-0 flex items-center justify-center rounded-lg text-[0.625rem] font-medium opacity-0 transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
            disabled={state.imageBusy}
            onClick={() => {
              void removeImage();
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
      {state.imageError ? (
        <ProfileError id={imageErrorId} message={state.imageError} />
      ) : null}
    </div>
  );
};

const ProfileEditor = ({
  currentEmail,
  initialName,
  savedImage,
  savedName,
}: {
  currentEmail: string;
  initialName: string;
  savedImage: string | null | undefined;
  savedName: string;
}) => {
  const { refresh } = useRouter();
  const nameFieldId = useId();
  const emailFieldId = useId();
  const codeFieldId = useId();
  const [state, dispatch] = useReducer(profileReducer, {
    code: "",
    email: currentEmail,
    emailBusy: false,
    emailError: null,
    emailStep: "edit",
    name: initialName,
    nameBusy: false,
    nameError: null,
  });
  const nameErrorId = `${nameFieldId}-error`;
  const emailErrorId = `${emailFieldId}-error`;
  const fieldsColumnRef = useRef<HTMLDivElement>(null);
  const [profilePhotoSizePx, setProfilePhotoSizePx] = useState<number | null>(
    null
  );
  const trimmedName = state.name.trim();
  const nameUnchanged = trimmedName === savedName.trim();
  const profilePhotoSize = profilePhotoSizePx ?? 80;

  useEffect(() => {
    const fieldsColumn = fieldsColumnRef.current;
    if (!fieldsColumn) {
      return;
    }
    const syncPhotoSize = () => {
      if (!profilePhotoMatchesWideLayout()) {
        setProfilePhotoSizePx(null);
        return;
      }
      const { height } = fieldsColumn.getBoundingClientRect();
      if (height > 0) {
        setProfilePhotoSizePx(height);
      }
    };
    syncPhotoSize();
    const observer = new ResizeObserver(syncPhotoSize);
    observer.observe(fieldsColumn);
    window.addEventListener("resize", syncPhotoSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPhotoSize);
    };
  }, []);

  const saveName = async () => {
    if (state.nameBusy || nameUnchanged) {
      return;
    }
    const parsed = profileNameSchema.safeParse(state.name);
    if (!parsed.success) {
      dispatch({
        error:
          state.name.trim().length > 80
            ? "Use 80 characters or fewer"
            : "Enter your name",
        type: "name-error",
      });
      return;
    }
    dispatch({ busy: true, type: "name-busy" });
    const result = await authClient.updateUser({ name: parsed.data });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not save your name"),
        type: "name-error",
      });
      return;
    }
    await authClient.getSession();
    refresh();
    dispatch({ type: "name-saved" });
    toast.success("Name saved");
  };

  const sendEmailCode = async () => {
    if (state.emailBusy) {
      return;
    }
    const parsed = profileEmailSchema.safeParse(state.email);
    if (!parsed.success) {
      dispatch({ error: "Enter a valid email", type: "email-error" });
      return;
    }
    if (sameAccountEmail(parsed.data, currentEmail)) {
      dispatch({ error: "That's already your email", type: "email-error" });
      return;
    }
    dispatch({ busy: true, type: "email-busy" });
    const result = await authClient.emailOtp.requestEmailChange({
      newEmail: parsed.data,
    });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not send a code"),
        type: "email-error",
      });
      return;
    }
    dispatch({ email: parsed.data, type: "email-sent" });
    toast.success("Code sent");
  };

  const confirmEmail = async () => {
    if (state.emailBusy) {
      return;
    }
    const parsed = profileCodeSchema.safeParse(
      state.code.replaceAll(/\s/gu, "")
    );
    if (!parsed.success) {
      dispatch({ error: "Enter the 6-digit code", type: "email-error" });
      return;
    }
    dispatch({ busy: true, type: "email-busy" });
    const result = await authClient.emailOtp.changeEmail({
      newEmail: state.email,
      otp: parsed.data,
    });
    if (result.error) {
      dispatch({
        error: profileErrorMessage(result.error, "Could not update your email"),
        type: "email-error",
      });
      return;
    }
    await authClient.getSession();
    refresh();
    dispatch({ type: "email-saved" });
    toast.success("Email updated");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:gap-6">
        <ProfilePhotoFields
          avatarSize={profilePhotoSize}
          currentEmail={currentEmail}
          matchedFieldsHeight={profilePhotoSizePx}
          savedImage={savedImage}
        />

        <div
          ref={fieldsColumnRef}
          className="flex min-w-0 flex-1 flex-col gap-5"
        >
          <form action={saveName} className="flex flex-col gap-2">
            <Label htmlFor={nameFieldId}>Update name</Label>
            <div className="flex items-center gap-2">
              <Input
                id={nameFieldId}
                type="text"
                name="name"
                autoComplete="name"
                maxLength={80}
                value={state.name}
                disabled={state.nameBusy}
                placeholder="Your name"
                aria-invalid={state.nameError ? true : undefined}
                aria-describedby={state.nameError ? nameErrorId : undefined}
                onChange={(event) => {
                  dispatch({ name: event.target.value, type: "name" });
                }}
              />
              <button
                type="submit"
                className={cn(
                  profileFieldButtonClass,
                  "inline-flex items-center gap-2"
                )}
                disabled={state.nameBusy || nameUnchanged || trimmedName === ""}
                aria-busy={state.nameBusy || undefined}
              >
                <ButtonBusyLabel busy={state.nameBusy}>Save</ButtonBusyLabel>
              </button>
            </div>
            {state.nameError ? (
              <ProfileError id={nameErrorId} message={state.nameError} />
            ) : null}
          </form>

          {state.emailStep === "edit" ? (
            <form action={sendEmailCode} className="flex flex-col gap-2">
              <Label htmlFor={emailFieldId}>Update email</Label>
              <EmailChangePrompt
                currentEmail={currentEmail}
                email={state.email}
              />
              <div className="flex items-center gap-2">
                <Input
                  id={emailFieldId}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={state.email}
                  disabled={state.emailBusy}
                  placeholder="you@business.com"
                  aria-invalid={state.emailError ? true : undefined}
                  aria-describedby={state.emailError ? emailErrorId : undefined}
                  onChange={(event) => {
                    dispatch({ email: event.target.value, type: "email" });
                  }}
                />
                <button
                  type="submit"
                  className={cn(
                    profileFieldButtonClass,
                    "inline-flex items-center gap-2"
                  )}
                  disabled={
                    state.emailBusy ||
                    !canSendEmailCode(state.email, currentEmail)
                  }
                  aria-busy={state.emailBusy || undefined}
                >
                  <ButtonBusyLabel busy={state.emailBusy}>
                    Send code
                  </ButtonBusyLabel>
                </button>
              </div>
              {state.emailError ? (
                <ProfileError id={emailErrorId} message={state.emailError} />
              ) : null}
            </form>
          ) : (
            <form action={confirmEmail} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={codeFieldId}>Email</Label>
                <button
                  type="button"
                  className="listwell-panel__action"
                  disabled={state.emailBusy}
                  onClick={() => dispatch({ type: "email-reset" })}
                >
                  Use a different email
                </button>
              </div>
              <p className="listwell-panel__note">
                Enter the code we sent to {maskAccountEmail(state.email)}. Your
                email stays {currentEmail} until this code is confirmed.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  id={codeFieldId}
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={state.code}
                  disabled={state.emailBusy}
                  placeholder="000000"
                  aria-invalid={state.emailError ? true : undefined}
                  aria-describedby={state.emailError ? emailErrorId : undefined}
                  className="font-mono tracking-[0.2em]"
                  onChange={(event) => {
                    dispatch({
                      code: event.target.value
                        .replaceAll(/\D/gu, "")
                        .slice(0, 6),
                      type: "code",
                    });
                  }}
                />
                <button
                  type="submit"
                  className={cn(
                    profileFieldButtonClass,
                    "inline-flex items-center gap-2"
                  )}
                  disabled={state.emailBusy || state.code.length !== 6}
                  aria-busy={state.emailBusy || undefined}
                >
                  <ButtonBusyLabel busy={state.emailBusy}>
                    Update email
                  </ButtonBusyLabel>
                </button>
              </div>
              {state.emailError ? (
                <ProfileError id={emailErrorId} message={state.emailError} />
              ) : null}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProfileSettingsDialog = ({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => {
  const clientReady = useClientHydrated();
  const session = authClient.useSession();
  const user = session.data?.user;

  useEffect(() => {
    restoreProfileSettings();
  }, []);

  const showEditor = clientReady && user !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>
            Update your photo, name, and email on your account.
          </DialogDescription>
        </DialogHeader>
        {showEditor ? (
          <ProfileEditor
            currentEmail={user.email}
            initialName={user.name ?? ""}
            savedImage={user.image}
            savedName={user.name ?? ""}
          />
        ) : (
          <ProfileDialogStatus pending={!clientReady || session.isPending} />
        )}
      </DialogContent>
    </Dialog>
  );
};

export const OpenProfileDialog = () => {
  const { replace } = useRouter();

  useEffect(() => {
    openProfileSettings();
    replace("/account");
  }, [replace]);

  return null;
};
