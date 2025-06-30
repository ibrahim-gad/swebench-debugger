mod commands;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::generate_docker_file,
            commands::build_docker_image,

            commands::stop_docker_build,
            commands::check_docker_image_exists,
            commands::run_docker_test,
            commands::stop_docker_test
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Show confirmation dialog
                    let app_handle = window.app_handle().clone();
                    
                    app_handle.dialog()
                        .message("Please make sure to save the JSON spec, because you won't be able to see it again.\n\nAre you sure you want to exit?")
                        .title("Exit Confirmation")
                        .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNo)
                        .show(move |confirmed| {
                            if confirmed {
                                // User confirmed, exit the application
                                app_handle.exit(0);
                            }
                            // If not confirmed, do nothing (window stays open)
                        });
                    
                    // Prevent default close behavior
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
