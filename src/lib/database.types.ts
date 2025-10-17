export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "member";
export type VisitStatus = "accepted" | "rejected";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_user_id: string;
          name: string | null;
          email: string;
          role: UserRole;
          is_banned: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          name?: string | null;
          email: string;
          role?: UserRole;
          is_banned?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          name?: string | null;
          email?: string;
          role?: UserRole;
          is_banned?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_auth_user_id_fkey";
            columns: ["auth_user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      faces: {
        Row: {
          id: string;
          user_id: string;
          embedding: Json;
          image_url: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          embedding: Json;
          image_url: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          embedding?: Json;
          image_url?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faces_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      visits: {
        Row: {
          id: string;
          timestamp: string;
          status: VisitStatus;
          image_url: string | null;
          matched_user_id: string | null;
        };
        Insert: {
          id?: string;
          timestamp?: string;
          status: VisitStatus;
          image_url?: string | null;
          matched_user_id?: string | null;
        };
        Update: {
          id?: string;
          timestamp?: string;
          status?: VisitStatus;
          image_url?: string | null;
          matched_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "visits_matched_user_id_fkey";
            columns: ["matched_user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: never;
    Functions: never;
    Enums: never;
    CompositeTypes: never;
  };
}
