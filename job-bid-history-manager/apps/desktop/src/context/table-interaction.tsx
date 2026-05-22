import { createContext, useContext } from "react";

type TableInteractionContextValue = {
  setHold: (key: string, active: boolean) => void;
  interactionHeld: boolean;
};

export const TableInteractionContext = createContext<TableInteractionContextValue>({
  setHold: () => {},
  interactionHeld: false,
});

export function useTableInteraction() {
  return useContext(TableInteractionContext);
}
