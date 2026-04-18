# Design System Strategy: The Curated Heritage

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Estate."** 

Ameer Global is not just a trading company; it is a legacy established in 1856. To reflect this, the UI must move away from the "SaaS-template" aesthetic of rigid grids and heavy borders. Instead, we treat the screen like a high-end editorial spread or a physical estate gallery. 

We achieve a "premium" feel through **intentional asymmetry** and **negative space as a luxury**. By allowing elements to breathe and occasionally overlap, we create a sense of bespoke craftsmanship. The experience should feel like flipping through a heavy-stock, matte-finish brand book where every element is placed with precision, not snapped to a generic box.

---

## 2. Colors & Surface Philosophy
The palette is a dialogue between the timeless (neutral whites/greys) and the organic (the commodities: greens, oranges, and pinks).

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section content. 
Structure is defined through "Tonal Shifts." To separate a hero section from a feature grid, transition the background from `surface` (#faf9f5) to `surface-container-low` (#f5f4f0). The eye will perceive the boundary through the change in value, resulting in a much softer, more sophisticated interface.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper.
*   **Base:** `surface` (#faf9f5) – The primary canvas.
*   **Lower Tier:** `surface-container-low` (#f5f4f0) – Use for subtle content grouping.
*   **Elevated Tier:** `surface-container-lowest` (#ffffff) – Use for high-priority cards or "floating" editorial elements. 

### The "Glass & Gradient" Rule
To add "soul," use subtle, expansive gradients. A CTA shouldn't just be a flat `primary` block; it should have a soft radial gradient moving from `primary` (#38451a) to `primary-container` (#4f5d2f). For floating navigation or over-image menus, use **Glassmorphism**: 
*   **Fill:** `surface` at 70% opacity.
*   **Effect:** Backdrop-blur (12px to 20px).
*   **Result:** The organic colors of the product photography (the mango oranges or farm greens) bleed through the UI, making it feel alive.

---

## 3. Typography: The Editorial Voice
Our typography is the bridge between 1856 and the modern global market.

*   **Display & Headlines (Noto Serif):** This is our "Heritage" voice. Use `display-lg` for impactful statements. Give these headers significant leading and letter-spacing (approx -0.02em) to feel like a premium broadsheet.
*   **Body & Labels (Manrope):** This is our "Functional" voice. It is clean, geometric, and modern. 
*   **The Contrast Principle:** Never pair a large serif with a large sans-serif of the same weight. If the headline is `headline-lg` (Noto Serif), the sub-header should be `label-md` (Manrope) in all-caps with increased letter spacing to create a clear "Editorial" hierarchy.

---

## 4. Elevation & Depth
In this system, depth is "Ambient," never "Structural."

*   **The Layering Principle:** Depth is achieved by stacking `surface-container` tiers. A `surface-container-lowest` card sitting on a `surface-container-high` background creates a natural lift without a single shadow.
*   **Ambient Shadows:** For elements that truly "float" (e.g., a modal or a floating action), use an ultra-diffused shadow:
    *   `box-shadow: 0 20px 50px rgba(27, 28, 26, 0.05);` (Using a tint of `on-surface`).
*   **The "Ghost Border" Fallback:** If a container is placed on a background of the same color, use a "Ghost Border": `outline-variant` (#c6c8b9) at **15% opacity**. It should be felt rather than seen.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#38451a) with `on-primary` text. Use `DEFAULT` (0.25rem) rounding for a sharp, architectural feel.
*   **Secondary (Organic):** Use `secondary` (#944a1b) for commerce-related actions (e.g., "Order Mangoes").
*   **Tertiary:** Text-only with a 1px underline that expands on hover. No box.

### Input Fields
*   **Style:** Minimalist. No background fill. Only a bottom border using `outline-variant`. 
*   **Focus State:** The bottom border transitions to `primary`, and the label (using `label-sm`) slides upward.

### Cards & Lists
*   **Rule:** Forbid divider lines. 
*   **The Content Gap:** Use the spacing scale (e.g., 2rem or 3rem) to separate items. 
*   **Artistic Flair:** Images within cards should use the `lg` (0.5rem) rounding, while the card container itself remains `none` or `sm` (0.125rem). This "nested rounding contrast" is a hallmark of high-end design.

### Signature Component: The "Heritage Ghost"
A large, low-opacity (5%) serif year "1856" or a watermark-style logo placed asymmetrically behind content, partially clipped by the edge of the screen.

---

## 6. Do’s and Don'ts

### Do:
*   **Do** use asymmetrical layouts. Place a heading on the left and the body text offset to the right.
*   **Do** use high-quality, art-directed photography. The "Sunset Orange" and "Earthy Green" should come from the images, not just the UI.
*   **Do** use "Micro-interactions." Transitions between pages should be a soft fade-in with a 20px vertical slide.

### Don’t:
*   **Don’t** use pure black (#000000). Always use `on-surface` (#1b1c1a) for a softer, premium look.
*   **Don’t** use "Card Walls." If you have multiple items, vary their sizes (e.g., one large card followed by two small ones) to maintain the editorial rhythm.
*   **Don’t** use heavy dropshadows. If the elevation isn't achieved through color shifts, the shadow must be nearly invisible.