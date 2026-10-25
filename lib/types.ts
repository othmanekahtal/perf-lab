export type Status = "completed" | "pending" | "failed" | "refunded";
export type Region = "North America" | "EMEA" | "LATAM" | "APAC";
export type RegionFilter = Region | "All";

export interface Transaction {
  id: string;
  date: string;
  customer: string;
  email: string;
  company: string;
  category: string;
  region: Region;
  country: string;
  status: Status;
  method: string;
  currency: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount: number;
  rating: number;
  tags: string[];
  notes: string;
}

export interface MonthPoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  "North America": number;
  EMEA: number;
  LATAM: number;
  APAC: number;
}

export interface Stats {
  revenue: number;
  orders: number;
  avgOrder: number;
  refundRate: number;
  failedRate: number;
  byMonth: MonthPoint[];
  byCategory: { name: string; revenue: number }[];
  byStatus: { name: Status; value: number }[];
  topCustomers: { name: string; revenue: number }[];
}
