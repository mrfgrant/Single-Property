import React, { useState } from "react";
import { Router as WouterRouter } from "wouter";
import { isAuthenticated, clearToken } from "@/lib/auth";
import Login from "@/pages/Login";
import Listings from "@/pages/Listings";
import ListingForm from "@/pages/ListingForm";
import type { ExampleListing } from "@/lib/api";

type Screen = "login" | "listings" | "form";

function App() {
  const [screen, setScreen] = useState<Screen>(isAuthenticated() ? "listings" : "login");
  const [editingListing, setEditingListing] = useState<ExampleListing | null>(null);

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

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      {screen === "login" && <Login onSuccess={handleLoginSuccess} />}
      {screen === "listings" && (
        <Listings onEdit={handleEdit} onLogout={handleLogout} />
      )}
      {screen === "form" && (
        <ListingForm
          listing={editingListing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </WouterRouter>
  );
}

export default App;
