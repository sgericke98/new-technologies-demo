'use server'

import { revalidatePath } from 'next/cache'

export async function revalidateSellerData(sellerId: string) {
  // Revalidate the specific seller page
  revalidatePath(`/sellers/${sellerId}`)
  
  // Revalidate the dashboard since it shows seller data
  revalidatePath('/dashboard')
  
  // Revalidate the sellers list page
  revalidatePath('/sellers')
}
