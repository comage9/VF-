import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  currentStock: integer("current_stock").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  lastRestock: timestamp("last_restock"),
  status: text("status").notNull().default("충분"), // 충분, 부족, 과잉
  barcode: text("barcode"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const outboundRecords = pgTable("outbound_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productName: text("product_name").notNull(),
  category: text("category").notNull(),
  quantity: integer("quantity").notNull(),
  salesAmount: integer("sales_amount"),
  outboundDate: timestamp("outbound_date").notNull(),
  status: text("status").notNull().default("완료"), // 완료, 처리중, 지연
  boxQuantity: integer("box_quantity"),
  unitCount: integer("unit_count"),
  barcode: text("barcode"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const dataSources = pgTable("data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'csv' | 'google_sheets'
  name: text("name").notNull(),
  url: text("url"),
  isActive: boolean("is_active").default(true),
  lastSync: timestamp("last_sync"),
  syncData: json("sync_data"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOutboundRecordSchema = createInsertSchema(outboundRecords).omit({
  id: true,
  createdAt: true,
});

export const insertDataSourceSchema = createInsertSchema(dataSources).omit({
  id: true,
  createdAt: true,
});

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

export type InsertOutboundRecord = z.infer<typeof insertOutboundRecordSchema>;
export type OutboundRecord = typeof outboundRecords.$inferSelect;

export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;
export type DataSource = typeof dataSources.$inferSelect;

// CSV data structure
export const csvDataSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export type CsvData = z.infer<typeof csvDataSchema>;

// Google Sheets data structure
export const googleSheetsDataSchema = z.object({
  range: z.string(),
  values: z.array(z.array(z.string())),
});

export type GoogleSheetsData = z.infer<typeof googleSheetsDataSchema>;
