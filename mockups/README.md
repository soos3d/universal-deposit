# Deposit Widget Mockups

This directory contains standalone HTML mockups for various deposit widget designs. These files are self-contained and can be viewed directly in a web browser.

## Available Mockups

1.  **`deposit-modal-v2.html`**: A full-featured, compact modal design with a purple theme.
2.  **`deposit-modal-inline-compact.html`**: A minimalist, single-line widget with a chain selector and expandable QR code.
3.  **`deposit-modal-qr-micro.html`**: An ultra-compact, QR-first widget with a tiny dropdown for chain selection.

## How to View

There are two ways to view these mockups:

### Method 1: Open Directly in Browser (Simple)

You can open any of the `.html` files directly in your web browser.

1.  Navigate to this directory in your file explorer.
2.  Double-click on the HTML file you want to view (e.g., `deposit-modal-v2.html`).

### Method 2: Use a Local Web Server (Recommended)

For the best experience and to ensure all features (like font loading and potential future scripts) work correctly, it's recommended to use a simple local web server.

1.  Open your terminal.
2.  Navigate to the root of this project: `cd /Users/davide/Documents/coding/particle-fafo/Deposit-Widget`
3.  Run the following command to serve the `mockups` directory:

    ```bash
    npx serve mockups
    ```

4.  The terminal will provide you with a local URL (e.g., `http://localhost:3000`). Open this URL in your browser.
5.  Click on the HTML file you wish to view from the directory listing.
