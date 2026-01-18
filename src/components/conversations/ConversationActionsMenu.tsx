import { useEffect, useState } from "react";
import clsx from "clsx";
import type { ConversationListData } from "../../types/Conversation";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { IconButton } from "../ui/IconButton";

export type ConversationActionsMenuVariant = "row" | "header" | "cortex";

type ConversationActionsMenuProps = {
  conversation: ConversationListData;
  variant?: ConversationActionsMenuVariant;
  align?: "left" | "right";
  onToggleHighPriority?: (conversation: ConversationListData) => void;
  onCopyInvite?: (conversation: ConversationListData) => Promise<boolean>;
  onOpenProfileFollowup?: (conversation: ConversationListData) => void;
  onEditName?: (conversation: ConversationListData) => void;
  onOpenHistory?: (conversation: ConversationListData) => void;
  onOpenSalesExtra?: (conversation: ConversationListData) => void;
  onBlockChat?: (conversation: ConversationListData) => void;
  onUnblockChat?: (conversation: ConversationListData) => void;
  onArchiveChat?: (conversation: ConversationListData) => void;
  actionDisabled?: boolean;
};

export function ConversationActionsMenu({
  conversation,
  variant = "row",
  align = "right",
  onToggleHighPriority,
  onCopyInvite,
  onOpenProfileFollowup,
  onEditName,
  onOpenHistory,
  onOpenSalesExtra,
  onBlockChat,
  onUnblockChat,
  onArchiveChat,
  actionDisabled = false,
}: ConversationActionsMenuProps) {
  const [inviteCopyState, setInviteCopyState] = useState<"idle" | "copying" | "copied" | "error">(
    "idle"
  );
  const isManagerChat = conversation.isManager === true;
  const hasActiveAccess =
    typeof conversation.hasActiveAccess === "boolean"
      ? conversation.hasActiveAccess
      : conversation.accessState === "ACTIVE";
  const isInvitePending = !isManagerChat && !conversation.inviteUsedAt && !hasActiveAccess;
  const canCopyInvite = isInvitePending && typeof onCopyInvite === "function";
  const inviteCopyLabel =
    inviteCopyState === "copied"
      ? "Copiado"
      : inviteCopyState === "copying"
      ? "Copiando..."
      : inviteCopyState === "error"
      ? "Error"
      : "Copiar enlace";
  const inviteCopyDisabled = inviteCopyState === "copied" || inviteCopyState === "copying";
  const isHighPriority = conversation.isHighPriority === true;
  const isBlocked = conversation.isBlocked === true;

  useEffect(() => {
    setInviteCopyState("idle");
  }, [conversation.id, conversation.inviteUsedAt]);

  async function handleCopyInvite() {
    if (!onCopyInvite) return;
    try {
      setInviteCopyState("copying");
      const ok = await onCopyInvite(conversation);
      setInviteCopyState(ok ? "copied" : "error");
      setTimeout(() => setInviteCopyState("idle"), 1500);
    } catch (_err) {
      setInviteCopyState("error");
      setTimeout(() => setInviteCopyState("idle"), 1500);
    }
  }

  const items: ContextMenuItem[] = [];
  if (onEditName) {
    items.push({
      label: "Editar nombre",
      icon: "edit",
      onClick: () => onEditName(conversation),
    });
  }
  if (!isManagerChat && onToggleHighPriority) {
    items.push({
      label: isHighPriority ? "Quitar alta prioridad" : "Marcar alta prioridad",
      icon: "pin",
      onClick: () => onToggleHighPriority(conversation),
      disabled: actionDisabled,
      title: "Alta prioridad",
      labelSrOnly: true,
    });
  }
  if (onOpenProfileFollowup) {
    items.push({
      label: "Perfil + seguimiento",
      icon: "note",
      onClick: () => onOpenProfileFollowup(conversation),
    });
  }
  if (onOpenHistory) {
    items.push({
      label: "Historial",
      icon: "receipt",
      onClick: () => onOpenHistory(conversation),
    });
  }
  if (onOpenSalesExtra) {
    items.push({
      label: "Ventas extra",
      icon: "gem",
      onClick: () => onOpenSalesExtra(conversation),
    });
  }
  if (canCopyInvite) {
    items.push({
      label: inviteCopyLabel,
      icon: "link",
      onClick: handleCopyInvite,
      disabled: inviteCopyDisabled,
      closeOnSelect: false,
    });
  }
  const hasBlockActions = Boolean(onBlockChat || onUnblockChat);
  if (hasBlockActions) {
    items.push({ label: "divider", divider: true });
    items.push({
      label: isBlocked ? "Desbloquear chat" : "Bloquear chat",
      icon: "lock",
      onClick: () => (isBlocked ? onUnblockChat?.(conversation) : onBlockChat?.(conversation)),
      danger: !isBlocked,
      disabled: actionDisabled,
    });
  }
  if (onArchiveChat) {
    items.push({
      label: "Archivar chat",
      icon: "folder",
      onClick: () => onArchiveChat(conversation),
      disabled: actionDisabled,
    });
  }

  if (items.length === 0) return null;

  const buttonIcon = variant === "header" ? "dots" : "chevronDown";
  const buttonSize = variant === "header" ? "md" : "sm";
  const buttonTone = variant === "header" ? "amber" : "neutral";
  const buttonClassName = clsx(
    variant === "row" && "opacity-70 hover:opacity-100",
    variant === "cortex" && "opacity-80 hover:opacity-100"
  );
  const buttonAriaLabel = variant === "header" ? "Más opciones del chat" : "Abrir acciones";

  return (
    <ContextMenu
      buttonAriaLabel={buttonAriaLabel}
      items={items}
      align={align}
      renderButton={({ ref, open, onClick, ariaLabel, ariaExpanded, ariaHaspopup, title }) => (
        <IconButton
          ref={ref}
          size={buttonSize}
          tone={buttonTone}
          active={open}
          icon={buttonIcon}
          ariaLabel={ariaLabel}
          ariaExpanded={ariaExpanded}
          ariaHaspopup={ariaHaspopup}
          title={title}
          onClick={onClick}
          className={buttonClassName}
        />
      )}
    />
  );
}
