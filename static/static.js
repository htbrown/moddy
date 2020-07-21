$('#deleteModal').on('show.bs.modal', function (event) {
    let button = $(event.relatedTarget)
    let command = button.data('command') 
    let modal = $(this)
    modal.find('.modal-body input').val(command)
})

$('#editModal').on('show.bs.modal', function (event) {
    let button = $(event.relatedTarget)
    let command = button.data('command') 
    let response = button.data('response');
    let modal = $(this)
    modal.find('#commandName').val(command)
    modal.find('#commandResponse').val(response)
})
