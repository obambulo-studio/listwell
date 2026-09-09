"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/atoms/button";

export const ChatComposer = ({
  placeholder,
  onSend,
  autoFocus = false,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  autoFocus?: boolean;
}) => {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="border-line bg-surface shadow-card w-full min-w-0 rounded-[14px] border p-2">
      <textarea
        ref={ref}
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
        className="text-ink placeholder:text-ink-3 min-h-[52px] w-full min-w-0 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 outline-none"
      />
      <div className="flex items-center justify-end gap-2 px-1 pb-0.5">
        <Button
          variant="primary"
          size="sm"
          disabled={!canSend}
          onClick={submit}
          aria-label="Send message"
        >
          Send message
        </Button>
      </div>
    </div>
  );
};
