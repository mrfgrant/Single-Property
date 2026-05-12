import React, { useState } from "react";
import { Router as WouterRouter } from "wouter";
import { isAuthenticated, clearToken } from "@/lib/auth";
import Login from "@/pages/Login";
import Listings from "@/pages/Listings";
import ListingForm from "@/pages/ListingForm";
import DomainSearch from "@/pages/DomainSearch";
import DomainsManager from "@/pages/DomainsManager";
import type { ExampleListing } from "@/lib/api";
import { LayoutList, Globe, Search, LogOut } from "lucide-react";

type Screen = "login" | "listings" | "form" | "domain-search" | "domains";

function NavBar({
  screen,
  onNav,
  onLogout,
}: {
  screen: Screen;
  onNav: (s: Screen) => void;
  onLogout: () => void;
}) {
  const navItems: { label: string; id: Screen; icon: React.ReactNode }[] = [
    { label: "Listings", id: "listings", icon: <LayoutList size={15} /> },
    { label: "Domain Search", id: "domain-search", icon: <Search size={15} /> },
    { label: "Domains", id: "domains", icon: <Globe size={15} /> },
  ];

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-0 flex items-center justify-between sticky top-0 z-10 h-14">
      <div className="flex items-center gap-6 h-full">
        <img src="/propsite-logo.png" alt="PropSite" className="h-6 w-auto shrink-0" />
        <nav className="flex items-center h-full">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={`flex items-center gap-1.5 px-4 h-full text-sm font-medium border-b-2 transition-colors ${
                screen === item.id || (screen === "form" && item.id === "listings")
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <button
        onClick={onLogout}
        className="flex items-center gap-1.5 h-9 px-3 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition-colors"
      >
        <LogOut size={15} />
        Logout
      </button>
    </header>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>(isAuthenticated() ? "listings" : "login");
  const [editingListing, setEditingListing] = useState<ExampleListing | null>(null);
  const [preselectedListingId, setPreselectedListingId] = useState<string | null>(null);
  const [listings, setListings] = useState<ExampleListing[]>([]);

  const handleLoginSuccess = () => setScreen("listings");

  const handleLogout = () => {
    clearToken();
    setScreen("login");
  };

  const handleEdit = (listing: ExampleListing | null) => {
    setEditingListing(listing);
    setScreen("form");
  };

  const handleSave = () => {
    setEditingListing(null);
    setScreen("listings");
  };

  const handleCancel = () => {
    setEditingListing(null);
    setScreen("listings");
  };

  const handleAssignDomain = (listing: ExampleListing) => {
    setPreselectedListingId(listing.id);
    setScreen("domain-search");
  };

  const handleDomainDone = () => {
    setPreselectedListingId(null);
    setScreen("listings");
  };

  if (screen === "login") {
    return (
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Login onSuccess={handleLoginSuccess} />
      </WouterRouter>
    );
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <div className="min-h-screen bg-gray-50">
        <NavBar screen={screen} onNav={setScreen} onLogout={handleLogout} />
        <main>
          {screen === "listings" && (
            <Listings
              onEdit={handleEdit}
              onAssignDomain={handleAssignDomain}
              onListingsLoaded={setListings}
            />
          )}
          {screen === "form" && (
            <ListingForm
              listing={editingListing}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          )}
          {screen === "domain-search" && (
            <DomainSearch
              listings={listings}
              preselectedListingId={preselectedListingId}
              onDone={handleDomainDone}
            />
          )}
          {screen === "domains" && <DomainsManager />}
        </main>
      </div>
    </WouterRouter>
  );
}

export default App;
