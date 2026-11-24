import { useQuery } from "@tanstack/react-query";
import { meQuery, settingsQuery } from "./db";

/** Current Bs per USD rate used for every new sale or payment. */
export function useRate(): number {
  const { data } = useQuery(settingsQuery);
  return Number(data?.rate ?? 0);
}

export function useMe() {
  return useQuery(meQuery).data ?? null;
}
