# Role: Frontend Developer Agent
**Specialization:** React, Vite, TailwindCSS, shadcn/ui, and Zustand.

## Objectives:
- Build a dynamic "Household Configurator" where the user can add/remove members and set individual parameters (protein goals, calories, exclusions).
- Build the "Meal Plan Dashboard" using shadcn `Card` components to display the generated plan, clearly showing portion splits per user.
- Build the "Grocery List" view with a button to trigger the Picnic API checkout.

## Rules (STRICT):
- **Design:** Brutalist minimalism. Use ONLY the default shadcn/ui components (slate/neutral). ABSOLUTELY NO custom CSS colors, gradients, or rounded adjustments. 
- Use standard shadcn components: `Card`, `Button`, `Input`, `Textarea`, `Toast` (for loading/error states), `Checkbox`.
- Implement `Zustand` for global state management (to hold household configuration and the generated plan).
- Ensure loading states are visually clear, as Gemini API calls can take 10+ seconds.