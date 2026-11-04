import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

/** Imperative-feeling confirm: `const confirm = useConfirm(); if (await confirm({...})) ...` */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve }));

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  const dialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <AlertDialogTitle>{state?.title}</AlertDialogTitle>
        {state?.description && <AlertDialogDescription>{state.description}</AlertDialogDescription>}
        <div className="mt-6 flex justify-end gap-2">
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction destructive={state?.destructive} onClick={() => close(true)}>
            {state?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog] as const;
}
