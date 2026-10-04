"use client";

import { UserIcon } from "@hugeicons/core-free-icons";
import { useRef, useState } from "react";

import { Icon } from "@/components/icon";
import {
  accountImageFromSession,
  avatarEdgesAreUsable,
  gravatarAvatarUrl,
} from "@/lib/account-avatar";

type AvatarStage = "custom" | "gravatar" | "icon";

const initialAvatarStage = (
  customImage: string | null,
  email: string
): AvatarStage => {
  if (customImage) {
    return "custom";
  }
  if (gravatarAvatarUrl(email)) {
    return "gravatar";
  }
  return "icon";
};

const nextAvatarStage = (stage: AvatarStage): AvatarStage => {
  if (stage === "custom") {
    return "gravatar";
  }
  return "icon";
};

const avatarSource = (
  stage: AvatarStage,
  customImage: string | null,
  email: string
): string => {
  if (stage === "custom" && customImage) {
    return customImage;
  }
  if (stage === "gravatar") {
    return gravatarAvatarUrl(email) ?? "";
  }
  return "";
};

const AccountAvatarDisplay = ({
  alt,
  className,
  customImage,
  email,
  height,
  iconClassName,
  iconSize,
  width,
}: {
  alt: string;
  className?: string;
  customImage: string | null;
  email: string;
  height: number;
  iconClassName?: string;
  iconSize?: number;
  width: number;
}) => {
  const [stage, setStage] = useState<AvatarStage>(() =>
    initialAvatarStage(customImage, email)
  );
  const rejectedSource = useRef<string | null>(null);
  const fallbackIconSize = iconSize ?? Math.min(width, height);
  const src = avatarSource(stage, customImage, email);

  const rejectStage = () => {
    if (rejectedSource.current === src) {
      return;
    }
    rejectedSource.current = src;
    setStage((current) => nextAvatarStage(current));
  };

  if (stage === "icon" || src === "") {
    return (
      <Icon className={iconClassName} icon={UserIcon} size={fallbackIconSize} />
    );
  }

  return (
    // eslint-disable-next-line nextjs/no-img-element -- user-supplied or public Gravatar URL
    <img
      alt={alt}
      className={className}
      height={height}
      onError={rejectStage}
      onLoad={(event) => {
        const { naturalHeight, naturalWidth } = event.currentTarget;
        if (avatarEdgesAreUsable(naturalWidth, naturalHeight)) {
          return;
        }
        rejectStage();
      }}
      referrerPolicy="no-referrer"
      src={src}
      width={width}
    />
  );
};

export const AccountAvatar = ({
  alt,
  className,
  email,
  height,
  iconClassName,
  iconSize,
  image,
  width,
}: {
  alt: string;
  className?: string;
  email: string;
  height: number;
  iconClassName?: string;
  iconSize?: number;
  image: string | null | undefined;
  width: number;
}) => {
  const customImage = accountImageFromSession(image);

  return (
    <AccountAvatarDisplay
      alt={alt}
      className={className}
      customImage={customImage}
      email={email}
      height={height}
      iconClassName={iconClassName}
      iconSize={iconSize}
      key={`${email}:${customImage ?? ""}`}
      width={width}
    />
  );
};
