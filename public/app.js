document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const menuForm = document.getElementById('menuForm');
    const menuItemsList = document.getElementById('menuItemsList');
    const formTitle = document.getElementById('formTitle');
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const clearSearch = document.getElementById('clearSearch');
    
    let isEditing = false;
    let currentItems = [];
    let retryCount = 0;
    const MAX_RETRIES = 5;
    
    // Fetch and display all menu items
    function fetchMenuItems() {
        fetch('/api/menu-items')
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || 'Failed to fetch menu items');
                    });
                }
                return response.json();
            })
            .then(items => {
                // Reset retry counter on success
                retryCount = 0;
                
                // Ensure items is an array before assigning
                if (Array.isArray(items)) {
                    currentItems = items;
                    displayMenuItems(items);
                } else {
                    console.error('Expected array but got:', typeof items);
                    displayMenuItems([]); // Pass empty array instead
                }
            })
            .catch(error => {
                console.error('Error fetching menu items:', error);
                
                // Show error in UI
                menuItemsList.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: red;">
                            ${error.message}. ${retryCount < MAX_RETRIES ? 'Retrying...' : 'Please refresh the page to try again.'}
                        </td>
                    </tr>
                `;
                
                // Retry logic with exponential backoff
                if (retryCount < MAX_RETRIES) {
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
                    retryCount++;
                    console.log(`Retrying in ${delay/1000} seconds... (Attempt ${retryCount} of ${MAX_RETRIES})`);
                    setTimeout(fetchMenuItems, delay);
                }
            });
    }
    
    // Display menu items in the table
    function displayMenuItems(items) {
        menuItemsList.innerHTML = '';
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" style="text-align: center;">No menu items found</td>';
            menuItemsList.appendChild(row);
            return;
        }
        
        items.forEach(item => {
            if (!item || typeof item !== 'object') {
                console.error('Invalid item:', item);
                return;
            }
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.name || 'N/A'}</td>
                <td>${item.description || 'N/A'}</td>
                <td>${item.category || 'N/A'}</td>
                <td>$${item.price}</td>
                <td>${item.is_vegetarian ? 'Yes' : 'No'}</td>
                <td class="action-buttons">
                    <button class="edit-btn" data-id="${item.id}">Edit</button>
                    <button class="delete-btn" data-id="${item.id}">Delete</button>
                </td>
            `;
            menuItemsList.appendChild(row);
        });
        
        // Add event listeners to the new buttons
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', handleEdit);
        });
        
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', handleDelete);
        });
    }
    
    // Handle form submission (create or update)
    menuForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Show "processing" state
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;
        
        const formData = {
            name: document.getElementById('name').value,
            description: document.getElementById('description').value,
            category: document.getElementById('category').value,
            price: document.getElementById('price').value,
            is_vegetarian: document.getElementById('isVegetarian').checked.toString()
        };
        
        if (isEditing) {
            // Update existing item
            const id = document.getElementById('menuId').value;
            fetch(`/api/menu-items/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || err.details || 'Failed to update item');
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('Item updated:', data);
                resetForm();
                fetchMenuItems();
            })
            .catch(error => {
                console.error('Error updating item:', error);
                alert('Error updating item: ' + error.message);
            })
            .finally(() => {
                // Reset button state
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            });
        } else {
            // Create new item
            fetch('/api/menu-items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || err.details || 'Failed to add item');
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('Item added:', data);
                resetForm();
                fetchMenuItems();
            })
            .catch(error => {
                console.error('Error adding item:', error);
                alert('Error adding item: ' + error.message);
            })
            .finally(() => {
                // Reset button state
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            });
        }
    });
    
    // Handle edit button click
    function handleEdit(e) {
        const id = e.target.dataset.id;
        
        fetch(`/api/menu-items/${id}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || err.details || 'Failed to fetch item details');
                    });
                }
                return response.json();
            })
            .then(item => {
                document.getElementById('menuId').value = item.id;
                document.getElementById('name').value = item.name;
                document.getElementById('description').value = item.description;
                document.getElementById('category').value = item.category;
                document.getElementById('price').value = parseFloat(item.price);
                document.getElementById('isVegetarian').checked = item.is_vegetarian;
                
                formTitle.textContent = 'Edit Menu Item';
                submitBtn.textContent = 'Update Item';
                cancelBtn.classList.remove('hidden');
                
                isEditing = true;
                
                // Scroll to form
                document.querySelector('.form-container').scrollIntoView({ behavior: 'smooth' });
            })
            .catch(error => {
                console.error('Error fetching item details:', error);
                alert('Error fetching item details: ' + error.message);
            });
    }
    
    // Handle delete button click
    function handleDelete(e) {
        const id = e.target.dataset.id;
        if (confirm('Are you sure you want to delete this item?')) {
            fetch(`/api/menu-items/${id}`, {
                method: 'DELETE'
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || err.details || 'Failed to delete item');
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('Item deleted:', data);
                fetchMenuItems();
            })
            .catch(error => {
                console.error('Error deleting item:', error);
                alert('Error deleting item: ' + error.message);
            });
        }
    }
    
    // Handle cancel button click
    cancelBtn.addEventListener('click', resetForm);
    
    // Handle search
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Handle clear search
    clearSearch.addEventListener('click', function() {
        searchInput.value = '';
        fetchMenuItems();
    });
    
    function performSearch() {
        const query = searchInput.value.trim();
        if (query === '') {
            fetchMenuItems();
            return;
        }
        
        fetch(`/api/search?q=${encodeURIComponent(query)}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || err.details || 'Failed to search menu items');
                    });
                }
                return response.json();
            })
            .then(items => {
                // Ensure items is an array
                if (Array.isArray(items)) {
                    displayMenuItems(items);
                } else {
                    displayMenuItems([]);
                }
            })
            .catch(error => {
                console.error('Error searching menu items:', error);
                alert('Error searching menu items: ' + error.message);
            });
    }
    
    // Reset the form to add new item state
    function resetForm() {
        menuForm.reset();
        document.getElementById('menuId').value = '';
        formTitle.textContent = 'Add New Menu Item';
        submitBtn.textContent = 'Add Item';
        cancelBtn.classList.add('hidden');
        isEditing = false;
    }
    
    // Check server health before starting
    function checkServerHealth() {
        fetch('/health')
            .then(response => response.json())
            .then(data => {
                if (data.database === 'Connected' && data.initialized === 'Yes') {
                    console.log('Server is healthy, database is connected');
                    fetchMenuItems();
                } else {
                    console.log('Server is up but database is not ready yet. Will retry...');
                    setTimeout(checkServerHealth, 2000);
                }
            })
            .catch(err => {
                console.error('Health check failed, will retry:', err);
                setTimeout(checkServerHealth, 2000);
            });
    }
    
    // Start by checking server health
    checkServerHealth();
});
