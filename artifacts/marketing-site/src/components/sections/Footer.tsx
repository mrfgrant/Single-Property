import React from "react";
import { PLATFORM_NAME } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="border-t border-border bg-warm-white py-12 px-6 lg:px-12">
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-xl flex items-baseline">
          <span className="font-serif font-normal text-ink">Prop</span>
          <span className="font-serif text-gold">Site</span>
        </div>
        
        <div className="text-sm text-muted font-light">
          &copy; {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
        </div>
        
        <div className="flex items-center gap-6 text-sm font-medium text-ink">
          <a href="#" className="hover:text-gold transition-colors">Privacy</a>
          <a href="#" className="hover:text-gold transition-colors">Terms</a>
          <a href="#" className="hover:text-gold transition-colors">Support</a>
        </div>
      </div>
    </footer>
  );
}
